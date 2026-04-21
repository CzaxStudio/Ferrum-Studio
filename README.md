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

## Demo (Recommended)

> Add a short GIF/video here showing:
>
> * Writing wrong code
> * Error appears
> * IDE suggests fix

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
