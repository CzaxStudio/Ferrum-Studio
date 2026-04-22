<div align="center">

```
  ⬡  FERRUM STUDIO
```

**The professional IDE built exclusively for Zig**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](https://github.com/wailsapp/wails)
[![Built with Wails](https://img.shields.io/badge/built%20with-Wails%20v2-orange?style=flat-square)](https://wails.io)
[![Language](https://img.shields.io/badge/language-Zig-orange?style=flat-square)](https://ziglang.org)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

*Fast. Native. Zero Electron.*

</div>

---

## Overview

Ferrum Studio is a lightweight, native desktop IDE designed from the ground up for the [Zig programming language](https://ziglang.org). Built with Go + [Wails](https://wails.io), it runs as a true native application — not a bundled Chromium browser. The result is an IDE that starts in under a second, uses under 50 MB of RAM, and feels fast on any machine.

Most editors treat Zig as an afterthought — a language server plugin bolted onto a general-purpose tool. Ferrum Studio is different. Every feature, shortcut, snippet, error message, and template is designed around the way Zig developers actually work.

---

## Screenshots


<img width="1365" height="720" alt="Capture15" src="https://github.com/user-attachments/assets/f03de5f3-9b9d-4e89-97bc-08eed8c97d17" />




<img width="1366" height="726" alt="Capture9" src="https://github.com/user-attachments/assets/7b9e6da8-f31e-42fd-b17f-6923d5b12ba9" />




<img width="1366" height="726" alt="Capture9" src="https://github.com/user-attachments/assets/e8e0eb18-2847-4fb0-99a4-6558f355b1f7" />



> Open a Zig project → `F5` to run → see output instantly in the integrated terminal.

```
┌─────────────────────────────────────────────────────────────┐
│ File  Edit  Run  Zig  View            zig 0.14.0  windows   │
├──────┬──────────────────────────────────────────────────────┤
│  ◈   │  main.zig  ×                                         │
│  ⚙   ├─ src / main.zig ──────────────────────────────────── │
│  ≡   │  1  const std = @import("std");                      │
│      │  2                                                    │
│ src/ │  3  pub fn main() !void {                            │
│  main│  4      const stdout = std.io.getStdOut().writer();  │
│ build│  5      try stdout.print("Hello!\n", .{});           │
│      │  6  }                                                 │
│      ├──────────────────────────────────────────────────────│
│      │ Terminal  ⚠ Problems  ✦ Tests  ⚙ Build               │
│      │ $ zig run src/main.zig                               │
│      │ Hello!                                               │
│      │ ─── ✓ exit 0 (0.31s) ───                            │
└──────┴──────────────────────────────────────────────────────┘
```

---

## Features

### Editor
| Feature | Detail |
|---|---|
| **Zig syntax highlighting** | Keywords, types, builtins, strings, numbers, bracket-pair colorization |
| **Smart indentation** | Auto-indent on Enter; extra indent after `{`, `(`, `[` |
| **Auto-close brackets** | `(`, `[`, `{` auto-close; skip-over on close key |
| **Bracket match highlight** | Matching bracket pair highlighted as you type |
| **IntelliSense** | 120+ completions — `std.*` modules, methods with signatures, `@builtins`, keywords, types |
| **Dot-chain aware AC** | Typing `std.mem.` shows only `std.mem.*` entries |
| **29 Zig snippets** | `fn`, `struct`, `enum`, `test`, `gpa`, `al`, `hm`, `defer`, `try`, `for`, `while`, and more |
| **Inline error ghost text** | Compiler errors shown inline ← next to the offending line |
| **Error squiggles** | Red/yellow wavy underlines directly on the error token |
| **Line number click** | Click any line number to select that entire line |
| **Smart Home key** | First press → first non-whitespace; second press → column 0 |
| **Ctrl+D** | Select next occurrence of word under cursor |
| **Ctrl+/** | Toggle line comment (`// `) |
| **Ctrl+G** | Go to line number |
| **Ctrl+F** | Find in file with regex and case-sensitive options |
| **Ctrl+P** | Quick open — fuzzy search across all open tabs and project files |
| **Word wrap** | `Ctrl+Shift+W` toggles soft wrap |
| **Font size** | `Ctrl+=` larger, `Ctrl+-` smaller, `Ctrl+0` reset. Remembered across sessions |
| **Multi-tab** | Open unlimited files; dirty indicator (orange dot); Ctrl+W to close |
| **Save As** | Native save-as dialog; safe on Windows (no Wails crash) |
| **Save before close** | Confirms before discarding unsaved changes |

### Zig Integration
| Feature | Detail |
|---|---|
| **Run** | `F5` — `zig run <file>` with live streaming output |
| **Run with args** | `F6` — dialog to pass `-- arg1 arg2 ...` |
| **Build** | `F7` — `zig build` with live output in Build panel |
| **Test** | `F8` — `zig test` with pass/fail results in Tests panel |
| **Format** | `Ctrl+Shift+F` — `zig fmt` in place |
| **Check** | `Ctrl+Shift+C` — `zig ast-check` for instant diagnostics without building |
| **Auto-check** | Diagnostics update 2.5 s after last keystroke (saves + checks silently) |
| **Interactive stdin** | Programs that read from stdin work. Type in the terminal, press Enter to send input |
| **Stop process** | `Ctrl+C` in terminal or ■ Stop button |
| **Build steps panel** | Reads `build.zig` steps and shows one-click run buttons for each |

### Problems Panel
- Errors and warnings grouped by file
- **Human-readable explanations** — "Type mismatch", "Writing to a constant", "Unused variable" instead of raw compiler dumps
- **Fix suggestions** — concrete `Fix →` hint for 20+ common Zig error patterns
- Click any error to jump directly to the line and column
- Error count badges on tabs and file tree

### Templates
Five production-quality project starters under **File → New from Template**:

| Template | What it creates |
|---|---|
| **Executable** | CLI app with argument parsing, GPA allocator, `build.zig`, `build.zig.zon`, README |
| **Library** | Static lib with a `Buffer` struct, allocator, tests |
| **TCP Server** | Multi-threaded HTTP echo server using `std.net` |
| **Embedded / Bare-Metal** | Freestanding Zig for Cortex-M4, no OS, UART output, panic handler |
| **Comptime Metaprogramming** | Generic `Stack(T)`, `@typeInfo` reflection, comptime array generation |

All files are written into your open project folder and the main `.zig` file opens automatically.

### Sidebar
- **Explorer** — file tree with Git status marks (`M`, `A`, `?`), right-click context menu, rename, delete, new file/folder
- **Build** — build steps from `build.zig`, one-click run each step
- **Snippets** — browsable reference of all snippets and `std` modules

### Terminal
- Integrated terminal at the bottom
- Full ANSI color support
- Command history (Arrow Up/Down)
- `run`, `build`, `test`, `fmt`, `check`, `zig <subcmd>` shortcuts
- **Interactive input** — when a Zig program is running and waiting for stdin, the terminal prompt changes to `>` and keypresses are forwarded directly to the process
- `Ctrl+C` kills the running process

### New Project
- **zig init** dialog — create a new project anywhere, auto-opens `src/main.zig`
- Pre-fills dialog with current open folder path
- Templates dialog for full starters

### Git Integration
- Branch name in status bar
- Modified (`M`), added (`A`), untracked (`?`), deleted (`D`) markers on every file in the tree
- Refreshes after every build

### Zig Detection
Ferrum Studio uses five strategies to find your Zig executable, in order:

1. Standard `PATH` lookup
2. **Windows registry** — reads `HKCU\Environment\Path` directly, so newly-installed Zig is found without restarting
3. `AppData\Local\zig`, `AppData\Local\Programs\zig`, and all `zig*` subdirectories
4. Common fixed paths (`C:\zig\zig.exe`, `/usr/local/bin/zig`, Homebrew, etc.)
5. Scans home directory, `~/Downloads`, `~/dev`, `C:\` for `zig-*` folders

If Zig still isn't found, a banner appears with:
- **↻ Retry Detection** — re-runs all detection without restarting
- **📂 Browse…** — file picker to locate `zig.exe` manually
- **⚙ Click zig badge** — opens a settings dialog to type or browse the path

---

## Installation

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Zig](https://ziglang.org/download/) | 0.13.0 or newer | Add to PATH |
| [Go](https://go.dev/dl/) | 1.21+ | Required to build |
| [Wails CLI](https://wails.io/docs/gettingstarted/installation) | v2.x | `go install github.com/wailsapp/wails/v2/cmd/wails@latest` |
| [Node.js](https://nodejs.org/) | 18+ | For frontend build |

**Windows only:** [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11; available free for Windows 10)

### Clone and run

```bash
git clone https://github.com/your-username/ferrum-studio
cd ferrum-studio
wails dev
```

### Build for distribution

```bash
# Windows
wails build -platform windows/amd64

# macOS
wails build -platform darwin/universal

# Linux
wails build -platform linux/amd64
```

Output binary is in `build/bin/`.

---

## Project Structure

```
ferrum-studio/
├── app.go                   # Go backend — all Zig integration, file I/O, Git
├── hidden_windows.go        # Windows: hide console windows for sub-processes
├── hidden_other.go          # macOS/Linux: no-op SysProcAttr
├── main.go                  # Wails entry point
├── wails.json               # Wails project config
└── frontend/
    └── src/
        ├── main.js          # Full IDE frontend (~3000 lines)
        ├── enhancements.js  # Templates, error explanations, fix suggestions
        └── style.css        # Complete dark theme (~820 lines)
```

### How it works

Ferrum Studio uses Wails to embed a WebView2 (Windows) / WKWebView (macOS) / WebKitGTK (Linux) pane inside a native Go application. The Go backend handles all OS operations — running Zig, reading files, opening dialogs, registry access — and communicates with the JavaScript frontend via an auto-generated bridge.

There is no Electron, no Node.js runtime, no bundled Chromium. The total binary is ~8 MB on Windows.

---

## Keyboard Shortcuts

### Editor
| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save and check |
| `Ctrl+Shift+F` | Format with zig fmt |
| `Ctrl+Shift+C` | Check (ast-check) |
| `Ctrl+/` | Toggle line comment |
| `Ctrl+D` | Select next occurrence |
| `Ctrl+F` | Find in file |
| `Ctrl+G` | Go to line |
| `Ctrl+P` | Quick open file |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+W` | Close tab |
| `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+0` | Reset font size |
| `Ctrl+Shift+W` | Toggle word wrap |
| `Home` | Smart home (first non-whitespace → column 0) |
| `Tab` | Expand snippet / indent |
| `Shift+Tab` | Unindent |

### Run
| Shortcut | Action |
|---|---|
| `F5` | Run file |
| `F6` | Run with arguments |
| `F7` | zig build |
| `F8` | zig test |
| `Ctrl+C` (in terminal) | Kill running process |

### Navigation
| Shortcut | Action |
|---|---|
| `Escape` | Close any open dialog/panel |
| `Ctrl+G` | Go to line |
| `Ctrl+P` | Quick open |
| Arrow Up/Down (terminal) | Command history |

---

## Snippets Reference

Trigger a snippet by typing its shorthand and pressing `Tab`.

| Trigger | Expands to |
|---|---|
| `fn` | `fn name(args) Type {}` |
| `pfn` | `pub fn name(args) Type {}` |
| `main` | `pub fn main() !void {}` |
| `struct` | `const X = struct {}` |
| `enum` | `const X = enum {}` |
| `union` | `const X = union(enum) {}` |
| `test` | `test "name" {}` |
| `if` | `if (cond) {}` |
| `ife` | `if (cond) {} else {}` |
| `for` | `for (iter) \|it\| {}` |
| `while` | `while (cond) {}` |
| `sw` | `switch (val) { else => {} }` |
| `defer` | `defer stmt;` |
| `errd` | `errdefer stmt;` |
| `gpa` | Full `GeneralPurposeAllocator` setup with `defer deinit()` |
| `al` | `ArrayList(T)` with `init` and `defer deinit` |
| `hm` | `StringHashMap(T)` with `init` and `defer deinit` |
| `try` | `try expr` |
| `std` | `const std = @import("std");` |
| `print` | `std.debug.print("...\n", .{});` |

---

## Comparing Ferrum Studio

| | Ferrum Studio | VS Code + ZLS | Zed |
|---|---|---|---|
| Purpose-built for Zig | ✓ | Partial | Partial |
| Native (no Electron) | ✓ | ✗ | ✓ |
| Interactive stdin | ✓ | ✓ | ✓ |
| Human-readable errors | ✓ | ✗ | ✗ |
| Fix suggestions | ✓ | ✗ | ✗ |
| Zig project templates | ✓ | ✗ | ✗ |
| Auto Zig detection | ✓ | Manual | Manual |
| RAM usage (idle) | ~35 MB | ~300 MB | ~80 MB |
| Cold start time | < 1 s | 3–8 s | 1–2 s |

---

## Contributing

Contributions are welcome. Areas where help is most valuable:

- **Language server protocol (LSP)** integration with ZLS for go-to-definition and hover docs
- **More error explanations** in `enhancements.js` — the `ZIG_ERROR_EXPLANATIONS` array
- **Themes** — the CSS uses CSS variables throughout; a light theme PR would be straightforward
- **Zig 0.14+ syntax** — keep the highlighter updated with new keywords
- **macOS / Linux testing** — most development has been on Windows

```bash
# Run in dev mode with hot reload
wails dev

# Frontend only (if you only changed JS/CSS)
cd frontend && npm run dev
```

---

## License

MIT License — see [LICENSE](LICENSE).

---

<div align="center">

Built with ♥ for the Zig community

*"Ferrum" is Latin for iron — the element that gives steel its strength.*

[ziglang.org](https://ziglang.org) · [wails.io](https://wails.io)

</div>
