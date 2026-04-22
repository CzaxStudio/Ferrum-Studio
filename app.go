package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	wails "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Ext      string     `json:"ext"`
	Children []FileNode `json:"children,omitempty"`
}

type Diag struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Col     int    `json:"col"`
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Source  string `json:"source"`
}

type BuildStep struct {
	Name string `json:"name"`
	Desc string `json:"desc"`
	Kind string `json:"kind"` // exe|lib|test|run|install|clean
}

type GitStatus struct {
	Modified  []string `json:"modified"`
	Added     []string `json:"added"`
	Untracked []string `json:"untracked"`
	Deleted   []string `json:"deleted"`
	Branch    string   `json:"branch"`
	HasGit    bool     `json:"hasGit"`
}

type App struct {
	ctx         context.Context
	projectRoot string
	zigPath     string
	proc        *os.Process
	procStdin   io.WriteCloser // stdin pipe for the running process
	procMu      sync.Mutex
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if home, err := os.UserHomeDir(); err == nil {
		a.projectRoot = home
	}
	a.zigPath = locateZig()
}

// ── Zig discovery ─────────────────────────────────────────────────────────────

// locateZig finds the zig executable using multiple strategies:
// 1. Current PATH (exec.LookPath)
// 2. Re-read the actual user PATH from registry/env file (catches post-install changes)
// 3. Known installation directories on Windows/Linux/macOS
// 4. Scan home directory for zig-* folders
func locateZig() string {
	// Strategy 1: standard PATH lookup
	if p, err := exec.LookPath("zig"); err == nil {
		return p
	}

	// Strategy 2: read the actual current user PATH from the OS
	// On Windows, the process inherits PATH from startup — new PATH entries
	// added after the IDE was built won't be visible. Read it fresh.
	if freshPath := getFreshPATH(); freshPath != "" {
		for _, dir := range filepath.SplitList(freshPath) {
			for _, name := range []string{"zig", "zig.exe"} {
				p := filepath.Join(dir, name)
				if _, err := os.Stat(p); err == nil {
					return p
				}
			}
		}
	}

	home, _ := os.UserHomeDir()

	// Strategy 3: known fixed locations
	candidates := []string{
		// Unix
		"/usr/local/bin/zig",
		"/usr/bin/zig",
		"/opt/homebrew/bin/zig",
		"/home/linuxbrew/.linuxbrew/bin/zig",
		filepath.Join(home, ".local", "bin", "zig"),
		filepath.Join(home, "bin", "zig"),
		filepath.Join(home, ".zig", "zig"),

		// Windows — all common install paths
		`C:\zig\zig.exe`,
		`C:\zig-windows-x86_64\zig.exe`,
		`C:\Program Files\zig\zig.exe`,
		`C:\Program Files (x86)\zig\zig.exe`,
		`C:\tools\zig\zig.exe`,
		filepath.Join(home, "zig", "zig.exe"),
		filepath.Join(home, ".zig", "zig.exe"),
	}

	// Windows AppData\Local (common for user-level installs)
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates,
			filepath.Join(localAppData, "zig", "zig.exe"),
			filepath.Join(localAppData, "Programs", "zig", "zig.exe"),
		)
		// Scan for zig-windows-* directories in AppData\Local
		if entries, err := os.ReadDir(localAppData); err == nil {
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(strings.ToLower(e.Name()), "zig") {
					candidates = append(candidates,
						filepath.Join(localAppData, e.Name(), "zig.exe"))
				}
			}
		}
	}

	// Scan home dir for zig-* and zig_* folders (manual extracts)
	for _, searchDir := range []string{home, filepath.Join(home, "Downloads"), filepath.Join(home, "dev"), `C:\`} {
		if entries, err := os.ReadDir(searchDir); err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				lower := strings.ToLower(e.Name())
				if strings.HasPrefix(lower, "zig") {
					candidates = append(candidates,
						filepath.Join(searchDir, e.Name(), "zig"),
						filepath.Join(searchDir, e.Name(), "zig.exe"))
				}
			}
		}
	}

	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	// Last resort: return "zig" and hope it's on PATH when commands run
	return "zig"
}

// getFreshPATH reads the current user's PATH directly from the OS,
// bypassing the inherited process environment which may be stale.
func getFreshPATH() string {
	switch goruntime.GOOS {
	case "windows":
		// Read from Windows registry — the authoritative source of user PATH
		return getWindowsUserPATH()
	case "linux":
		// Source common shell profile files
		return getUnixShellPATH()
	case "darwin":
		return getUnixShellPATH()
	}
	return ""
}

func getWindowsUserPATH() string {
	// Use reg.exe to read the user PATH from registry
	// This works even if the IDE was launched before PATH was updated
	cmd := exec.Command("reg", "query",
		`HKCU\Environment`,
		"/v", "Path")
	cmd.SysProcAttr = hiddenWindow()
	out, err := cmd.Output()
	if err != nil {
		// Also try system PATH
		cmd2 := exec.Command("reg", "query",
			`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`,
			"/v", "Path")
		cmd2.SysProcAttr = hiddenWindow()
		out2, err2 := cmd2.Output()
		if err2 != nil {
			return ""
		}
		out = out2
	}
	// reg query output: "    Path    REG_SZ    C:\Windows\system32;..."
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(line), "PATH") {
			// Format: "Path    REG_SZ    <value>" or "Path    REG_EXPAND_SZ    <value>"
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				// Expand environment variables in the path
				rawPath := strings.Join(parts[2:], " ")
				return os.ExpandEnv(rawPath)
			}
		}
	}
	return ""
}

func getUnixShellPATH() string {
	// Run the user's shell with -l (login) to get the real PATH
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	cmd := exec.Command(shell, "-l", "-c", "echo $PATH")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func augmentedEnv() []string {
	env := os.Environ()
	home, _ := os.UserHomeDir()

	// Static extras — always appended
	extraDirs := []string{
		"/usr/local/bin", "/opt/homebrew/bin",
		"/home/linuxbrew/.linuxbrew/bin",
		"/usr/bin", "/bin",
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "bin"),
	}

	// Also add the fresh user PATH (catches post-install PATH changes on Windows)
	if fresh := getFreshPATH(); fresh != "" {
		for _, dir := range filepath.SplitList(fresh) {
			extraDirs = append(extraDirs, dir)
		}
	}

	extra := strings.Join(extraDirs, string(os.PathListSeparator))

	for i, kv := range env {
		if strings.HasPrefix(kv, "PATH=") || strings.HasPrefix(kv, "Path=") {
			env[i] = kv + string(os.PathListSeparator) + extra
			return env
		}
	}
	return append(env, "PATH="+extra)
}

// ── File system ───────────────────────────────────────────────────────────────

func (a *App) OpenFolder() string {
	p, err := wails.OpenDirectoryDialog(a.ctx, wails.OpenDialogOptions{Title: "Open Project Folder"})
	if err != nil || p == "" {
		return ""
	}
	a.projectRoot = p
	return p
}

func (a *App) OpenFile() map[string]string {
	p, err := wails.OpenFileDialog(a.ctx, wails.OpenDialogOptions{
		Title: "Open File",
		Filters: []wails.FileFilter{
			{DisplayName: "Zig Files", Pattern: "*.zig"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil || p == "" {
		return nil
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil
	}
	return map[string]string{"path": p, "content": string(b)}
}

func (a *App) ReadFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(b)
}

func (a *App) WriteFile(path, content string) string {
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err.Error()
	}
	return ""
}

// SaveFileDialog is disabled on Windows due to a Wails v2.12 bug:
// The native save dialog triggers WebView2.Focus() while open, which panics
// with "The parameter is incorrect" in the Windows message loop.
// The panic is on the OS message loop goroutine so recover() cannot catch it.
//
// Workaround: we return "" immediately and let the JS side handle Save As
// via a simple text-input dialog (no native dialog). This is safe and stable.
func (a *App) SaveFileDialog(name string) string {
	// Return empty string — JS will show its own inline Save As prompt.
	// This avoids the Wails v2.12 Windows WebView2 crash entirely.
	return ""
}

// SaveAs writes content to an explicit path provided by the caller.
// Used by the JS "Save As" flow that bypasses the broken native dialog.
func (a *App) SaveAs(path, content string) string {
	if path == "" {
		return "empty path"
	}
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) GetFileTree(root string) FileNode {
	if root == "" {
		root = a.projectRoot
	}
	node, _ := buildTree(root, 0)
	return node
}

func (a *App) CreateFile(path string) string {
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	if err := os.WriteFile(path, []byte(""), 0644); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) CreateDir(path string) string {
	if err := os.MkdirAll(path, 0755); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) DeletePath(path string) string {
	if err := os.RemoveAll(path); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) RenamePath(oldPath, newPath string) string {
	if err := os.Rename(oldPath, newPath); err != nil {
		return err.Error()
	}
	return ""
}

func buildTree(path string, depth int) (FileNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileNode{}, err
	}
	e := strings.TrimPrefix(filepath.Ext(info.Name()), ".")
	node := FileNode{Name: info.Name(), Path: path, IsDir: info.IsDir(), Ext: e}
	if !info.IsDir() || depth > 6 {
		return node, nil
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		return node, nil
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir() != entries[j].IsDir() {
			return entries[i].IsDir()
		}
		return strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
	})
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		child, err := buildTree(filepath.Join(path, entry.Name()), depth+1)
		if err == nil {
			node.Children = append(node.Children, child)
		}
	}
	return node, nil
}

// ── Git integration ───────────────────────────────────────────────────────────

func (a *App) GetGitStatus() GitStatus {
	gs := GitStatus{}

	// Check if git repo
	_, err := os.Stat(filepath.Join(a.projectRoot, ".git"))
	if err != nil {
		return gs
	}
	gs.HasGit = true

	// Get branch
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = a.projectRoot
	if out, err := cmd.Output(); err == nil {
		gs.Branch = strings.TrimSpace(string(out))
	}

	// Get status
	cmd = exec.Command("git", "status", "--porcelain")
	cmd.Dir = a.projectRoot
	out, err := cmd.Output()
	if err != nil {
		return gs
	}

	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 3 {
			continue
		}
		x := line[0]
		y := line[1]
		file := strings.TrimSpace(line[3:])
		switch {
		case x == 'M' || y == 'M':
			gs.Modified = append(gs.Modified, file)
		case x == 'A':
			gs.Added = append(gs.Added, file)
		case x == '?' && y == '?':
			gs.Untracked = append(gs.Untracked, file)
		case x == 'D' || y == 'D':
			gs.Deleted = append(gs.Deleted, file)
		}
	}
	return gs
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

func parseDiags(output, source string) []Diag {
	var out []Diag
	sc := bufio.NewScanner(strings.NewReader(output))
	for sc.Scan() {
		if d, ok := parseDiagLine(sc.Text(), source); ok {
			out = append(out, d)
		}
	}
	return out
}

func parseDiagLine(line, source string) (Diag, bool) {
	line = stripAnsi(line)
	if line == "" {
		return Diag{}, false
	}
	prefix := ""
	rest := line
	if len(line) >= 3 && isLetter(line[0]) && line[1] == ':' && (line[2] == '\\' || line[2] == '/') {
		prefix = line[:2]
		rest = line[2:]
	}
	parts := strings.SplitN(rest, ":", 4)
	if len(parts) < 4 {
		return Diag{}, false
	}
	lineNum, err1 := strconv.Atoi(strings.TrimSpace(parts[1]))
	colNum, err2 := strconv.Atoi(strings.TrimSpace(parts[2]))
	if err1 != nil || err2 != nil || lineNum <= 0 {
		return Diag{}, false
	}
	tail := strings.TrimSpace(parts[3])
	var kind, msg string
	for _, k := range []string{"error", "warning", "note"} {
		if strings.HasPrefix(tail, k+":") {
			kind = k
			msg = strings.TrimSpace(tail[len(k)+1:])
			break
		}
	}
	if kind == "" {
		return Diag{}, false
	}
	return Diag{
		File: prefix + parts[0], Line: lineNum, Col: colNum,
		Kind: kind, Message: msg, Source: source,
	}, true
}

func stripAnsi(s string) string {
	var b strings.Builder
	i := 0
	for i < len(s) {
		if s[i] == '\x1b' && i+1 < len(s) && s[i+1] == '[' {
			i += 2
			for i < len(s) && s[i] != 'm' {
				i++
			}
			i++
		} else {
			b.WriteByte(s[i])
			i++
		}
	}
	return b.String()
}

func isLetter(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

// ── ZigCheck ─────────────────────────────────────────────────────────────────

func (a *App) ZigCheck(path string) []Diag {
	cmd := exec.Command(a.zigPath, "ast-check", path)
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	out, _ := cmd.CombinedOutput()
	diags := parseDiags(string(out), "ast-check")
	for i, d := range diags {
		if !filepath.IsAbs(d.File) {
			diags[i].File = filepath.Join(a.projectRoot, d.File)
		}
	}
	return diags
}

// ── RunZig (streaming) ────────────────────────────────────────────────────────

func (a *App) RunZig(cmdline string) {
	a.KillProc()
	go func() {
		parts := tokenise(cmdline)
		if len(parts) == 0 {
			wails.EventsEmit(a.ctx, "zig:out", "\x1b[31merror: empty command\x1b[0m\n")
			wails.EventsEmit(a.ctx, "zig:done", 1)
			return
		}
		source := parts[0]
		ctx, cancel := context.WithTimeout(a.ctx, 5*60*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, a.zigPath, parts...)
		cmd.Env = augmentedEnv()
		cmd.Dir = a.projectRoot

		// Open pipes BEFORE Start() — order matters
		stdinPipe, stdinErr := cmd.StdinPipe()
		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			wails.EventsEmit(a.ctx, "zig:out",
				fmt.Sprintf("\x1b[31m[ferrum] cannot start zig\nerror: %v\nzig path: %s\x1b[0m\n", err, a.zigPath))
			wails.EventsEmit(a.ctx, "zig:done", 1)
			wails.EventsEmit(a.ctx, "zig:diags", []Diag{})
			return
		}

		a.procMu.Lock()
		a.proc = cmd.Process
		if stdinErr == nil {
			a.procStdin = stdinPipe
		} else {
			a.procStdin = nil
		}
		a.procMu.Unlock()

		var stderrLines []string
		var mu sync.Mutex
		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			buf := make([]byte, 4096)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					wails.EventsEmit(a.ctx, "zig:out", string(buf[:n]))
				}
				if err != nil {
					return
				}
			}
		}()

		go func() {
			defer wg.Done()
			sc := bufio.NewScanner(stderr)
			sc.Buffer(make([]byte, 1024*1024), 1024*1024)
			for sc.Scan() {
				line := sc.Text()
				wails.EventsEmit(a.ctx, "zig:out", line+"\n")
				mu.Lock()
				stderrLines = append(stderrLines, line)
				mu.Unlock()
			}
		}()

		wg.Wait()
		code := 0
		if err := cmd.Wait(); err != nil {
			if ex, ok := err.(*exec.ExitError); ok {
				code = ex.ExitCode()
			} else {
				code = 1
			}
		}

		a.procMu.Lock()
		a.proc = nil
		if a.procStdin != nil {
			a.procStdin.Close()
			a.procStdin = nil
		}
		a.procMu.Unlock()

		combined := strings.Join(stderrLines, "\n")
		diags := parseDiags(combined, source)
		for i, d := range diags {
			if !filepath.IsAbs(d.File) {
				diags[i].File = filepath.Join(a.projectRoot, d.File)
			}
		}
		wails.EventsEmit(a.ctx, "zig:diags", diags)
		wails.EventsEmit(a.ctx, "zig:done", code)
	}()
}

// SendInput writes a line of text to the running process's stdin.
// Called when the user presses Enter in the terminal while a process is running.
func (a *App) SendInput(text string) {
	a.procMu.Lock()
	pipe := a.procStdin
	a.procMu.Unlock()
	if pipe == nil {
		return
	}
	// Write the text followed by a newline (as if user pressed Enter)
	_, _ = fmt.Fprintln(pipe, text)
}

func (a *App) KillProc() {
	a.procMu.Lock()
	p := a.proc
	a.proc = nil
	a.procMu.Unlock()
	if p != nil {
		p.Kill()
	}
}

func (a *App) ZigFmt(path string) string {
	cmd := exec.Command(a.zigPath, "fmt", path)
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	cmd.CombinedOutput()
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(b)
}

// ── Build steps ───────────────────────────────────────────────────────────────

func (a *App) GetBuildSteps() []BuildStep {
	cmd := exec.Command(a.zigPath, "build", "--help")
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	out, err := cmd.Output()
	if err != nil {
		return defaultBuildSteps()
	}

	var steps []BuildStep
	inSteps := false
	for _, line := range strings.Split(string(out), "\n") {
		if strings.TrimSpace(line) == "Steps:" {
			inSteps = true
			continue
		}
		if inSteps {
			if line == "" || (len(line) > 0 && line[0] != ' ') {
				break
			}
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			parts := strings.SplitN(trimmed, " ", 2)
			name := strings.TrimRight(parts[0], ":")
			desc := ""
			if len(parts) > 1 {
				desc = strings.TrimSpace(parts[1])
			}
			kind := kindForStep(name)
			steps = append(steps, BuildStep{Name: name, Desc: desc, Kind: kind})
		}
	}
	if len(steps) == 0 {
		return defaultBuildSteps()
	}
	return steps
}

func kindForStep(name string) string {
	switch {
	case strings.Contains(name, "test"):
		return "test"
	case name == "install":
		return "install"
	case name == "uninstall" || name == "clean":
		return "clean"
	case strings.Contains(name, "run"):
		return "run"
	default:
		return "build"
	}
}

func defaultBuildSteps() []BuildStep {
	return []BuildStep{
		{Name: "install", Desc: "Build and install", Kind: "install"},
		{Name: "run", Desc: "Run the application", Kind: "run"},
		{Name: "test", Desc: "Run all tests", Kind: "test"},
		{Name: "uninstall", Desc: "Remove installed files", Kind: "clean"},
	}
}

// ── Scaffold project ──────────────────────────────────────────────────────────

func (a *App) ScaffoldProject(dir, kind string) string {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "error: " + err.Error()
	}
	a.projectRoot = dir
	cmd := exec.Command(a.zigPath, "init")
	cmd.Env = augmentedEnv()
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "error: " + err.Error() + "\n" + string(out)
	}
	return string(out)
}

// ── Zig info ──────────────────────────────────────────────────────────────────

func (a *App) ZigVersion() string {
	cmd := exec.Command(a.zigPath, "version")
	cmd.Env = augmentedEnv()
	out, err := cmd.Output()
	if err != nil {
		return "not found"
	}
	return strings.TrimSpace(string(out))
}

func (a *App) GetZigInfo() map[string]string {
	ver := a.ZigVersion()
	return map[string]string{
		"version": ver,
		"path":    a.zigPath,
		"os":      goruntime.GOOS,
		"arch":    goruntime.GOARCH,
	}
}

func (a *App) GetPlatform() string    { return goruntime.GOOS + "/" + goruntime.GOARCH }
func (a *App) GetProjectRoot() string { return a.projectRoot }
func (a *App) GetZigPath() string     { return a.zigPath }

// SetZigPath lets the user manually point to their zig executable.
// Called from the frontend "Browse for zig" button.
func (a *App) SetZigPath(p string) string {
	if p == "" {
		return "empty path"
	}
	// Verify it actually runs
	cmd := exec.Command(p, "version")
	cmd.Env = augmentedEnv()
	out, err := cmd.Output()
	if err != nil {
		return "not executable: " + err.Error()
	}
	a.zigPath = p
	return strings.TrimSpace(string(out))
}

// BrowseForZig opens a file picker so the user can locate zig.exe manually.
func (a *App) BrowseForZig() string {
	p, err := wails.OpenFileDialog(a.ctx, wails.OpenDialogOptions{
		Title: "Find your Zig executable",
		Filters: []wails.FileFilter{
			{DisplayName: "zig / zig.exe", Pattern: "zig;zig.exe"},
			{DisplayName: "All files", Pattern: "*"},
		},
	})
	if err != nil || p == "" {
		return ""
	}
	return a.SetZigPath(p)
}

// RetryZigDetection re-runs locateZig — useful after the user installs zig
// and wants the IDE to pick it up without restarting.
func (a *App) RetryZigDetection() map[string]string {
	a.zigPath = locateZig()
	return a.GetZigInfo()
}

// ── tokenise ─────────────────────────────────────────────────────────────────

func tokenise(s string) []string {
	var out []string
	var cur strings.Builder
	inQ := false
	for _, c := range s {
		switch {
		case c == '"':
			inQ = !inQ
		case (c == ' ' || c == '\t') && !inQ:
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteRune(c)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}
