# Ferrum Studio – Zig IDE with Smart Error Fixes 

Write Zig without frustration.

Ferrum Studio is a modern IDE focused on **making Zig easier to learn and use** — especially through **human-readable error messages and real fix suggestions**.

---

## Why Ferrum Studio?

Zig is powerful, but error messages and setup can slow you down.

Ferrum Studio solves that by:

* Explaining errors in **plain English**
* Suggesting **real fixes**, not just messages
* Providing a **smooth, ready-to-use Zig workflow**

---

## Features

### Smart Error System (Core Feature)

* Inline error highlighting
* Clear explanations (not cryptic compiler text)
* Suggested fixes like:

  ```zig
  const myVar = @import("...");
  ```
* Beginner-friendly diagnostics

---

### Built-in Zig Commands

Run everything without touching the terminal:

* `Run` → smart execution (auto detects project vs single file)
* `Build`
* `Test`
* `Fmt`
* `Check`

---

### Project Support

* Full support for:

  * `build.zig`
  * `build.zig.zon`
* Works with:

  ```bash
  zig build run
  ```

---

### Explorer + Structure

* Proper Zig project layout
* Access to:

  * `src/`
  * `zig-cache/`
  * `zig-out/`

---

### Snippets & Reference Panel

* Quick access to Zig keywords and std library
* Helps beginners learn faster

---

### Integrated Terminal

* Run interactive programs
* View output directly inside IDE

---

## Screenshots


<img width="1366" height="726" alt="Capture9" src="https://github.com/user-attachments/assets/1413c41c-76e5-45d8-a9c9-0127103f724f" />


<img width="1365" height="720" alt="Capture15" src="https://github.com/user-attachments/assets/46135d08-a4af-4904-b6c1-f11db105fef2" />


<img width="1366" height="724" alt="Capture11" src="https://github.com/user-attachments/assets/112264ea-0709-4b7c-be13-9d55560a388c" />


<img width="1366" height="724" alt="Capture10" src="https://github.com/user-attachments/assets/a0de3f52-5ecf-4518-baac-c67d1a048c65" />



---

## Getting Started

1. Install Zig (0.11+ recommended)
2. Open Ferrum Studio
3. Open a folder or create a new Zig project
4. Click **Run** ▶

---

## Example

Write incorrect code:

```zig
const x = unknownVar;
```

Ferrum Studio shows:

```
 Unknown name
Zig cannot find anything named 'unknownVar'

 Fix:
- Check spelling
- Import module
- Declare before use
```

---

## Goal

Ferrum Studio aims to become:

>  The easiest way to learn and use Zig

---

## Roadmap

* [ ] More intelligent error fixes
* [ ] Quick Fix (auto-apply suggestions)
* [ ] Autocomplete for Zig
* [ ] Debugging support
* [ ] Better UI/UX polish

---

## Contributing

Contributions are welcome!

If you have ideas, suggestions, or improvements — feel free to open an issue or PR.

---

## Support

If you like Ferrum Studio, consider giving it a star ⭐
It helps the project grow and reach more developers.

---

## Final Note

Ferrum Studio is not just another editor.

It’s an attempt to make Zig:

* easier
* faster
* more enjoyable

---

**Built for developers who want Zig to “just work.”**
