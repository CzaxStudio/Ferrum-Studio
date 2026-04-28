<div align="center">


```
  ⬡  FERRUM STUDIO
```

**The professional IDE built exclusively for Nim**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](https://github.com/wailsapp/wails)
[![Built with Wails](https://img.shields.io/badge/built%20with-Wails%20v2-orange?style=flat-square)](https://wails.io)
[![Language](https://img.shields.io/badge/language-Nim-yellow?style=flat-square)](https://nim-lang.org)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

*Fast. Native. Zero Electron.*

</div>

---

## Overview

Ferrum Studio is a lightweight, native desktop IDE designed from the ground up for the [Nim programming language]. Built with Go + [Wails](https://wails.io), it runs as a true native application — not a bundled Chromium browser. The result is an IDE that starts in under a second, uses under 50 MB of RAM, and feels fast on any machine.

Most editors treat Nim as an afterthought — a language server plugin bolted onto a general-purpose tool. Ferrum Studio is different. Every feature, shortcut, snippet, error message, and template is designed around the way Nim developers actually work.

---

## Screenshots








<img width="1366" height="709" alt="Capture" src="https://github.com/user-attachments/assets/621bf84f-a3b5-4f1c-a7d4-85e3b3e83247" />



<img width="1362" height="724" alt="ferrum" src="https://github.com/user-attachments/assets/b0b4fb87-a644-4cdd-a0c0-63af98c7de97" />



<img width="1365" height="723" alt="Capture11" src="https://github.com/user-attachments/assets/8689b35c-219e-429a-a96f-c38b8ad34ae4" />



<img width="1366" height="725" alt="Capture15" src="https://github.com/user-attachments/assets/5ff1f01e-8177-412d-a0f7-f2b78072c846" />







> Open a Nim project → `F5` to run → see output instantly in the integrated terminal.

```
┌─────────────────────────────────────────────────────────────┐
│ File  Edit  Run  Nim  View            Nim 2.2.10  windows   │
├──────┬──────────────────────────────────────────────────────┤
│  ◈   │  main.Nim  ×                                         │
│  ⚙   ├─ src / main.Nim ──────────────────────────────────── │
│  ≡   │  1  echo "Hello"                                     │
│      │  2                                                   │
│ src/ │  3                                                   │
│  main│  4                                                   │
│ build│  5                                                   │
│      │  6                                                   │
│      ├──────────────────────────────────────────────────────│
│      │ Terminal  ⚠ Problems  ✦ Tests  ⚙ Build             │
│      │                                                      │
│      │ Hello!                                               │
│      │ ─── [OK] exit 0 (0.31s) ───                          │
└──────┴──────────────────────────────────────────────────────┘
```

---


---

## Features

### Editor

- Nim syntax highlighting
- Smart indentation (whitespace-aware)
- Auto-close brackets
- Bracket match highlighting
- IntelliSense (modules, procs, templates, macros)
- Dot-aware autocomplete
- Snippets support
- Inline error hints
- Error squiggles
- Multi-tab editing
- Word wrap toggle
- Quick open (Ctrl+P)

---

### Nim Integration

- `F5` → Run (`nim c -r`)
- `F6` → Run with arguments
- `F7` → Build
- `F8` → Test
- Format via `nim pretty`
- Fast diagnostics via `nim check`
- Auto-check after typing
- Interactive stdin support
- Stop process with Ctrl+C

---

### Problems Panel

- Clean error explanations
- Click to jump to line
- Grouped by file
- Suggestions for common mistakes

---

### Templates

- CLI App
- Library
- Web App
- Async App
- Metaprogramming examples

---

### Sidebar

- File explorer with Git indicators
- Snippets browser
- Build shortcuts

---

### Terminal

- Integrated terminal
- ANSI colors
- Command history
- Interactive input support

---

### Git Integration

- Branch display
- File status indicators
- Auto refresh

---

### Nim Detection

Ferrum Studio detects Nim automatically using:

1. PATH lookup
2. Common install directories
3. Home directory scan
4. Manual selection fallback

---

## Installation(For Go devs)

### Prerequisites

- Nim (1.6+ or 2.x)
- Go (1.21+)
- Wails CLI v2
- Node.js 18+

---

### Run

```bash
git clone https://github.com/CzaxStudio/Ferrum-Studio
cd ferrum-studio
wails dev

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

Ferrum Studio uses Wails to embed a WebView2 (Windows) / WKWebView (macOS) / WebKitGTK (Linux) pane inside a native Go application. The Go backend handles all OS operations — running Nim, reading files, opening dialogs, registry access — and communicates with the JavaScript frontend via an auto-generated bridge.

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
| `F7` | nim build |
| `F8` | nim test |
| `Ctrl+C` (in terminal) | Kill running process |

### Navigation
| Shortcut | Action |
|---|---|
| `Escape` | Close any open dialog/panel |
| `Ctrl+G` | Go to line |
| `Ctrl+P` | Quick open |
| Arrow Up/Down (terminal) | Command history |

---

---

## Comparing Ferrum Studio

| | Ferrum Studio | VS Code + ZLS | Zed |
|---|---|---|---|
| Purpose-built for Nim | ✓ | Partial | Partial |
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


AI Usage

Frontend UI was partially assisted by AI tools.
Core backend and architecture were implemented manually.


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

Built with ♥ for the Nim community

</div> ```

*"Ferrum" is Latin for iron — the element that gives steel its strength.*

## Thanks <3

[claude](https://claude.ai/) · [wails.io](https://wails.io)

[nim](nim-lang.org)            [Golang](https://go.dev/)

</div>
