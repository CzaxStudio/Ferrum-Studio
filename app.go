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
	Kind string `json:"kind"`
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
	nimPath     string // path to nim executable
	nimblePath  string // path to nimble executable
	proc        *os.Process
	procStdin   io.WriteCloser
	procMu      sync.Mutex
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if home, err := os.UserHomeDir(); err == nil {
		a.projectRoot = home
	}
	a.nimPath = locateNim()
	a.nimblePath = locateNimble()
}

// ── Nim discovery ─────────────────────────────────────────────────────────────

func locateNim() string {
	// Strategy 1: standard PATH
	if p, err := exec.LookPath("nim"); err == nil {
		return p
	}
	// Strategy 2: fresh PATH from OS
	if freshPath := getFreshPATH(); freshPath != "" {
		for _, dir := range filepath.SplitList(freshPath) {
			for _, name := range []string{"nim", "nim.exe"} {
				p := filepath.Join(dir, name)
				if _, err := os.Stat(p); err == nil {
					return p
				}
			}
		}
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		// Unix
		"/usr/local/bin/nim",
		"/usr/bin/nim",
		"/opt/homebrew/bin/nim",
		"/home/linuxbrew/.linuxbrew/bin/nim",
		filepath.Join(home, ".local", "bin", "nim"),
		filepath.Join(home, "bin", "nim"),
		filepath.Join(home, ".nimble", "bin", "nim"),
		filepath.Join(home, "nim", "bin", "nim"),
		// Windows
		`C:\nim\bin\nim.exe`,
		`C:\Program Files\nim\bin\nim.exe`,
		filepath.Join(home, "nim", "bin", "nim.exe"),
		filepath.Join(home, ".nimble", "bin", "nim.exe"),
	}
	// choosenim puts nim in ~/.nimble/bin
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates,
			filepath.Join(localAppData, "nim", "bin", "nim.exe"),
			filepath.Join(localAppData, "choosenim", "toolchains", "nim-stable", "bin", "nim.exe"),
		)
		if entries, err := os.ReadDir(localAppData); err == nil {
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(strings.ToLower(e.Name()), "nim") {
					candidates = append(candidates,
						filepath.Join(localAppData, e.Name(), "bin", "nim.exe"))
				}
			}
		}
	}
	// Scan common dirs for nim-* folders
	for _, searchDir := range []string{home, filepath.Join(home, "Downloads"), filepath.Join(home, "dev"), `C:\`} {
		if entries, err := os.ReadDir(searchDir); err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				lower := strings.ToLower(e.Name())
				if strings.HasPrefix(lower, "nim") {
					candidates = append(candidates,
						filepath.Join(searchDir, e.Name(), "bin", "nim"),
						filepath.Join(searchDir, e.Name(), "bin", "nim.exe"))
				}
			}
		}
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "nim"
}

func locateNimble() string {
	if p, err := exec.LookPath("nimble"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".nimble", "bin", "nimble"),
		filepath.Join(home, ".nimble", "bin", "nimble.exe"),
		"/usr/local/bin/nimble",
		"/usr/bin/nimble",
		`C:\nim\bin\nimble.exe`,
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "nimble"
}

func getFreshPATH() string {
	switch goruntime.GOOS {
	case "windows":
		return getWindowsUserPATH()
	case "linux", "darwin":
		return getUnixShellPATH()
	}
	return ""
}

func getWindowsUserPATH() string {
	cmd := exec.Command("reg", "query", `HKCU\Environment`, "/v", "Path")
	cmd.SysProcAttr = hiddenWindow()
	out, err := cmd.Output()
	if err != nil {
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
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(line), "PATH") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				return os.ExpandEnv(strings.Join(parts[2:], " "))
			}
		}
	}
	return ""
}

func getUnixShellPATH() string {
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
	extraDirs := []string{
		"/usr/local/bin", "/opt/homebrew/bin",
		"/home/linuxbrew/.linuxbrew/bin",
		"/usr/bin", "/bin",
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "bin"),
		filepath.Join(home, ".nimble", "bin"),
		filepath.Join(home, "nim", "bin"),
	}
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

func (a *App) OpenFile() string {
	p, err := wails.OpenFileDialog(a.ctx, wails.OpenDialogOptions{
		Title: "Open File",
		Filters: []wails.FileFilter{
			{DisplayName: "Nim files", Pattern: "*.nim;*.nims;*.nimble"},
			{DisplayName: "All files", Pattern: "*"},
		},
	})
	if err != nil || p == "" {
		return ""
	}
	return p
}

func (a *App) ReadFile(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return string(b)
}

func (a *App) WriteFile(p, content string) string {
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) SaveAs(path, content string) string {
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "error: " + err.Error()
	}
	return ""
}

func (a *App) SaveFileDialog(name string) string { return "" }

func (a *App) CreateFile(p string) string {
	if err := os.WriteFile(p, []byte(""), 0644); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) CreateDir(p string) string {
	if err := os.MkdirAll(p, 0755); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) DeletePath(p string) string {
	if err := os.RemoveAll(p); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) RenamePath(old, newp string) string {
	if err := os.Rename(old, newp); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) GetFileTree(root string) (*FileNode, error) {
	if root == "" {
		root = a.projectRoot
	}
	node, err := buildTree(root, 0)
	if err != nil {
		return nil, err
	}
	return &node, nil
}

func buildTree(path string, depth int) (FileNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileNode{}, err
	}
	node := FileNode{
		Name:  info.Name(),
		Path:  path,
		IsDir: info.IsDir(),
		Ext:   strings.TrimPrefix(filepath.Ext(info.Name()), "."),
	}
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

// ── Git ───────────────────────────────────────────────────────────────────────

func (a *App) GetGitStatus() GitStatus {
	gs := GitStatus{}
	if _, err := os.Stat(filepath.Join(a.projectRoot, ".git")); err != nil {
		return gs
	}
	gs.HasGit = true
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.SysProcAttr = hiddenWindow()
	cmd.Dir = a.projectRoot
	if out, err := cmd.Output(); err == nil {
		gs.Branch = strings.TrimSpace(string(out))
	}
	cmd = exec.Command("git", "status", "--porcelain")
	cmd.SysProcAttr = hiddenWindow()
	cmd.Dir = a.projectRoot
	out, err := cmd.Output()
	if err != nil {
		return gs
	}
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 3 {
			continue
		}
		x, y, file := line[0], line[1], strings.TrimSpace(line[3:])
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

// parseDiagLine parses a single line of Nim compiler output.
// Nim format: /path/to/file.nim(10, 5) Error: undeclared identifier: 'x'
// Also handles Windows paths: C:\path\to\file.nim(10, 5) Error: ...
func parseDiagLine(line, source string) (Diag, bool) {
	line = stripAnsi(strings.TrimSpace(line))
	if line == "" {
		return Diag{}, false
	}

	// Find the (line, col) marker — everything before it is the file path
	parenOpen := strings.LastIndex(line, "(")
	parenClose := strings.Index(line[parenOpen+1:], ")")
	if parenOpen < 0 || parenClose < 0 {
		return Diag{}, false
	}
	parenClose += parenOpen + 1

	filePath := strings.TrimSpace(line[:parenOpen])
	if filePath == "" {
		return Diag{}, false
	}

	// Parse "line, col" inside parens
	coords := line[parenOpen+1 : parenClose]
	coordParts := strings.SplitN(coords, ",", 2)
	if len(coordParts) != 2 {
		return Diag{}, false
	}
	lineNum, err1 := strconv.Atoi(strings.TrimSpace(coordParts[0]))
	colNum, err2 := strconv.Atoi(strings.TrimSpace(coordParts[1]))
	if err1 != nil || err2 != nil || lineNum <= 0 {
		return Diag{}, false
	}

	// Rest after ) is " Error: msg" or " Warning: msg" etc
	tail := strings.TrimSpace(line[parenClose+1:])
	var kind, msg string
	for _, k := range []string{"Error", "Warning", "Hint", "error", "warning", "hint"} {
		if strings.HasPrefix(tail, k+":") {
			lower := strings.ToLower(k)
			if lower == "hint" {
				kind = "note"
			} else {
				kind = lower
			}
			msg = strings.TrimSpace(tail[len(k)+1:])
			break
		}
	}
	if kind == "" {
		return Diag{}, false
	}

	return Diag{
		File:    filePath,
		Line:    lineNum,
		Col:     colNum,
		Kind:    kind,
		Message: msg,
		Source:  source,
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

func isLetter(c byte) bool { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }

// ── NimCheck — nim check <file> ───────────────────────────────────────────────

func (a *App) NimCheck(path string) []Diag {
	// Use nim check with --errorMax:0 (show all errors) and --hints:off (reduce noise)
	// --listFullPaths ensures absolute paths in output for correct file association
	cmd := exec.Command(a.nimPath, "check",
		"--hints:off",
		"--errorMax:0",
		"--listFullPaths",
		path)
	cmd.SysProcAttr = hiddenWindow()
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	out, _ := cmd.CombinedOutput()
	diags := parseDiags(string(out), "nim check")
	for i, d := range diags {
		if !filepath.IsAbs(d.File) {
			diags[i].File = filepath.Join(a.projectRoot, d.File)
		}
	}
	return diags
}

// ── RunNim (streaming) ────────────────────────────────────────────────────────

func (a *App) RunNim(cmdline string) {
	a.KillProc()
	go func() {
		parts := tokenise(cmdline)
		if len(parts) == 0 {
			wails.EventsEmit(a.ctx, "nim:out", "\x1b[31merror: empty command\x1b[0m\n")
			wails.EventsEmit(a.ctx, "nim:done", 1)
			return
		}
		source := parts[0]
		ctx, cancel := context.WithTimeout(a.ctx, 5*60*time.Second)
		defer cancel()

		// Resolve nim/nimble/nimr for the command
		exe := a.nimPath
		if parts[0] == "nimble" {
			exe = a.nimblePath
			parts = parts[1:]
		}

		cmd := exec.CommandContext(ctx, exe, parts...)
		cmd.SysProcAttr = hiddenWindow()
		cmd.Env = augmentedEnv()
		cmd.Dir = a.projectRoot

		stdinPipe, stdinErr := cmd.StdinPipe()
		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			wails.EventsEmit(a.ctx, "nim:out",
				fmt.Sprintf("\x1b[31m[ferrum] cannot start nim\nerror: %v\nnim path: %s\x1b[0m\n", err, a.nimPath))
			wails.EventsEmit(a.ctx, "nim:done", 1)
			wails.EventsEmit(a.ctx, "nim:diags", []Diag{})
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

		var stderrOutput strings.Builder
		var mu sync.Mutex
		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			buf := make([]byte, 4096)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					wails.EventsEmit(a.ctx, "nim:out", string(buf[:n]))
				}
				if err != nil {
					return
				}
			}
		}()

		go func() {
			defer wg.Done()
			buf := make([]byte, 4096)
			for {
				n, err := stderr.Read(buf)
				if n > 0 {
					chunk := string(buf[:n])
					wails.EventsEmit(a.ctx, "nim:out", chunk)
					mu.Lock()
					stderrOutput.WriteString(chunk)
					mu.Unlock()
				}
				if err != nil {
					return
				}
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

		combined := stderrOutput.String()
		diags := parseDiags(combined, source)
		for i, d := range diags {
			if !filepath.IsAbs(d.File) {
				diags[i].File = filepath.Join(a.projectRoot, d.File)
			}
		}
		wails.EventsEmit(a.ctx, "nim:diags", diags)
		wails.EventsEmit(a.ctx, "nim:done", code)
	}()
}

func (a *App) SendInput(text string) {
	a.procMu.Lock()
	pipe := a.procStdin
	a.procMu.Unlock()
	if pipe == nil {
		return
	}
	_, _ = fmt.Fprintln(pipe, text)
}

func (a *App) KillProc() {
	a.procMu.Lock()
	p := a.proc
	stdin := a.procStdin
	a.procStdin = nil
	a.proc = nil
	a.procMu.Unlock()
	if stdin != nil {
		stdin.Close()
	}
	if p != nil {
		p.Kill()
	}
}

// ── NimFmt — nimpretty <file> ─────────────────────────────────────────────────

func (a *App) NimFmt(path string) string {
	// nimpretty formats in place — try nimpretty first, fall back to nim --nep1
	nimpretty, err := exec.LookPath("nimpretty")
	if err != nil {
		// Try beside the nim binary
		nimpretty = filepath.Join(filepath.Dir(a.nimPath), "nimpretty")
		if _, statErr := os.Stat(nimpretty); statErr != nil {
			nimpretty = filepath.Join(filepath.Dir(a.nimPath), "nimpretty.exe")
		}
	}
	cmd := exec.Command(nimpretty, path)
	cmd.SysProcAttr = hiddenWindow()
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	if out, fmtErr := cmd.CombinedOutput(); fmtErr != nil {
		return "error: " + string(out)
	}
	b, readErr := os.ReadFile(path)
	if readErr != nil {
		return ""
	}
	return string(b)
}

// ── Build steps (nimble tasks) ────────────────────────────────────────────────

func (a *App) GetBuildSteps() []BuildStep {
	// Check if nimble project exists
	if _, err := os.Stat(filepath.Join(a.projectRoot, "*.nimble")); err != nil {
		// Fallback: glob for .nimble file
		entries, _ := os.ReadDir(a.projectRoot)
		hasNimble := false
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".nimble") {
				hasNimble = true
				break
			}
		}
		if !hasNimble {
			return defaultBuildSteps()
		}
	}
	cmd := exec.Command(a.nimblePath, "tasks")
	cmd.SysProcAttr = hiddenWindow()
	cmd.Env = augmentedEnv()
	cmd.Dir = a.projectRoot
	out, err := cmd.Output()
	if err != nil {
		return defaultBuildSteps()
	}
	var steps []BuildStep
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Nim") {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		name := strings.TrimRight(parts[0], ":")
		if name == "" {
			continue
		}
		desc := ""
		if len(parts) > 1 {
			desc = strings.TrimSpace(parts[1])
		}
		steps = append(steps, BuildStep{Name: name, Desc: desc, Kind: kindForStep(name)})
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
		{Name: "build", Desc: "nim c -d:release src/main.nim", Kind: "install"},
		{Name: "run", Desc: "nim r src/main.nim", Kind: "run"},
		{Name: "test", Desc: "nimble test", Kind: "test"},
		{Name: "install", Desc: "nimble install", Kind: "install"},
	}
}

// ── Scaffold project (nimble init) ────────────────────────────────────────────

func (a *App) ScaffoldProject(dir, kind string) string {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "error: " + err.Error()
	}
	a.projectRoot = dir
	// nimble init is interactive — create minimal structure manually instead
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		return "error creating src: " + err.Error()
	}
	projName := filepath.Base(dir)
	mainContent := fmt.Sprintf(`# %s
# Entry point

echo "Hello from Nim!"
`, projName)
	mainPath := filepath.Join(srcDir, projName+".nim")
	if err := os.WriteFile(mainPath, []byte(mainContent), 0644); err != nil {
		return "error: " + err.Error()
	}
	nimbleContent := fmt.Sprintf(`# Package
version = "0.1.0"
author = "Your Name"
description = "A new Nim project"
license = "MIT"
srcDir = "src"
bin = @["%s"]

# Dependencies
requires "nim >= 2.0.0"
`, projName)
	nimblePath := filepath.Join(dir, projName+".nimble")
	if err := os.WriteFile(nimblePath, []byte(nimbleContent), 0644); err != nil {
		return "error: " + err.Error()
	}
	return fmt.Sprintf("Created %s.nim and %s.nimble\n", projName, projName)
}

// ── Nim info ──────────────────────────────────────────────────────────────────

func (a *App) NimVersion() string {
	cmd := exec.Command(a.nimPath, "--version")
	cmd.SysProcAttr = hiddenWindow()
	cmd.Env = augmentedEnv()
	out, err := cmd.Output()
	if err != nil {
		return "not found"
	}
	// First line: "Nim Compiler Version X.Y.Z ..."
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) > 0 {
		line := lines[0]
		if i := strings.Index(line, "Version"); i >= 0 {
			parts := strings.Fields(line[i:])
			if len(parts) >= 2 {
				return parts[1]
			}
		}
		return strings.TrimSpace(line)
	}
	return "not found"
}

func (a *App) GetNimInfo() map[string]string {
	ver := a.NimVersion()
	return map[string]string{
		"version": ver,
		"path":    a.nimPath,
		"os":      goruntime.GOOS,
		"arch":    goruntime.GOARCH,
	}
}

func (a *App) GetPlatform() string    { return goruntime.GOOS + "/" + goruntime.GOARCH }
func (a *App) GetProjectRoot() string { return a.projectRoot }
func (a *App) GetNimPath() string     { return a.nimPath }

func (a *App) SetNimPath(p string) string {
	if p == "" {
		return "empty path"
	}
	cmd := exec.Command(p, "--version")
	cmd.SysProcAttr = hiddenWindow()
	cmd.Env = augmentedEnv()
	out, err := cmd.Output()
	if err != nil {
		return "not executable: " + err.Error()
	}
	a.nimPath = p
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) > 0 {
		return strings.TrimSpace(lines[0])
	}
	return "ok"
}

func (a *App) BrowseForNim() string {
	p, err := wails.OpenFileDialog(a.ctx, wails.OpenDialogOptions{
		Title: "Find your Nim executable",
		Filters: []wails.FileFilter{
			{DisplayName: "nim / nim.exe", Pattern: "nim;nim.exe"},
			{DisplayName: "All files", Pattern: "*"},
		},
	})
	if err != nil || p == "" {
		return ""
	}
	return a.SetNimPath(p)
}

func (a *App) RetryNimDetection() map[string]string {
	a.nimPath = locateNim()
	a.nimblePath = locateNimble()
	return a.GetNimInfo()
}

// ── tokenise ──────────────────────────────────────────────────────────────────

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
