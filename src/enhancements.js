// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO — enhancements.js
//  • Project Templates (real Nim starters)
//  • Human-readable Nim error explanations + fix suggestions
// ══════════════════════════════════════════════════════════════════════════════

// ── Project Templates ─────────────────────────────────────────────────────────
export const TEMPLATES = [
  {
    id: 'exe',
    name: 'Executable',
    icon: '⚡',
    desc: 'A command-line program with argument parsing and nimble build file',
    files: {
      'src/main.nim': `import std/os
import std/strutils

proc main() =
  let args = commandLineParams()
  if args.len == 0:
    echo "Usage: " & getAppFilename() & " <name>"
    quit(1)
  echo "Hello, " & args[0] & "!"

main()
`,
      'myapp.nimble': `# Package
version       = "0.1.0"
author        = "Your Name"
description   = "A Nim command-line application"
license       = "MIT"
srcDir        = "src"
bin           = @["main"]

# Dependencies
requires "nim >= 2.0.0"
`,
      'config.nims': `# NimScript build configuration
switch("opt", "speed")
switch("gc", "refc")
`,
      'README.md': `# myapp

A Nim command-line application.

## Build & Run

\`\`\`bash
nimble build
./main World
# or run directly:
nim r src/main.nim World
\`\`\`

## Test

\`\`\`bash
nimble test
\`\`\`
`,
    },
  },

  {
    id: 'lib',
    name: 'Library',
    icon: '📦',
    desc: 'A reusable Nim library with public API and tests',
    files: {
      'src/mylib.nim': `## mylib — a reusable Nim library.
## Import with: import mylib

proc add*(a, b: int): int =
  ## Add two integers together.
  a + b

proc multiply*(a, b: int): int =
  ## Multiply two integers.
  a * b

type
  Buffer* = object
    ## A growable buffer that owns its memory.
    data*: seq[byte]

proc newBuffer*(): Buffer =
  ## Create an empty Buffer.
  Buffer(data: @[])

proc add*(buf: var Buffer, bytes: openArray[byte]) =
  ## Append bytes to the buffer.
  for b in bytes: buf.data.add(b)

proc add*(buf: var Buffer, s: string) =
  ## Append a string to the buffer.
  for c in s: buf.data.add(byte(c))

proc len*(buf: Buffer): int = buf.data.len

proc toString*(buf: Buffer): string =
  ## Convert buffer contents to a string.
  result = newString(buf.data.len)
  for i, b in buf.data: result[i] = char(b)
`,
      'tests/test_mylib.nim': `import unittest
import mylib

suite "mylib tests":
  test "add works":
    check add(2, 3) == 5
    check add(-1, 1) == 0

  test "multiply works":
    check multiply(3, 4) == 12

  test "Buffer append":
    var buf = newBuffer()
    buf.add("Hello")
    buf.add(", World!")
    check buf.toString() == "Hello, World!"
    check buf.len == 13
`,
      'mylib.nimble': `# Package
version       = "0.1.0"
author        = "Your Name"
description   = "A reusable Nim library"
license       = "MIT"
srcDir        = "src"

# Dependencies
requires "nim >= 2.0.0"

task test, "Run the tests":
  exec "nim r tests/test_mylib.nim"
`,
    },
  },

  {
    id: 'server',
    name: 'HTTP Server',
    icon: '🌐',
    desc: 'An async HTTP server using std/asynchttpserver',
    files: {
      'src/main.nim': `import std/asynchttpserver
import std/asyncdispatch
import std/strutils
import std/json

let server = newAsyncHttpServer()

proc handler(req: Request) {.async.} =
  let headers = newHttpHeaders([("Content-Type", "text/plain")])
  case req.url.path
  of "/":
    await req.respond(Http200, "Hello from Ferrum Studio Nim Server!\n", headers)
  of "/json":
    let jsonHeaders = newHttpHeaders([("Content-Type", "application/json")])
    let body = $ %* {"message": "Hello!", "nim": NimVersion}
    await req.respond(Http200, body, jsonHeaders)
  of "/echo":
    await req.respond(Http200, req.body & "\n", headers)
  else:
    await req.respond(Http404, "Not Found\n", headers)

proc main() {.async.} =
  echo "Server running on http://localhost:8080"
  server.listen(Port(8080))
  while true:
    if server.shouldAcceptRequest():
      await server.acceptRequest(handler)
    else:
      await sleepAsync(500)

waitFor main()
`,
      'server.nimble': `# Package
version       = "0.1.0"
author        = "Your Name"
description   = "A Nim async HTTP server"
license       = "MIT"
srcDir        = "src"
bin           = @["main"]

requires "nim >= 2.0.0"
`,
    },
  },

  {
    id: 'cli',
    name: 'CLI Tool',
    icon: '🔧',
    desc: 'A full-featured CLI tool using parseopt',
    files: {
      'src/main.nim': `## A CLI tool built with Nim.
## Usage: mytool [options] <input>

import std/os
import std/parseopt
import std/strutils

type
  Config = object
    verbose: bool
    output:  string
    input:   string

proc parseArgs(): Config =
  result = Config(output: "output.txt")
  var p = initOptParser(commandLineParams())

  while true:
    p.next()
    case p.kind
    of cmdEnd: break
    of cmdShortOption, cmdLongOption:
      case p.key
      of "v", "verbose": result.verbose = true
      of "o", "output":  result.output  = p.val
      of "h", "help":
        echo """Usage: mytool [options] <input>

Options:
  -v, --verbose    Verbose output
  -o, --output     Output file (default: output.txt)
  -h, --help       Show this help"""
        quit(0)
      else:
        echo "Unknown option: " & p.key
        quit(1)
    of cmdArgument:
      result.input = p.key

proc main() =
  let cfg = parseArgs()

  if cfg.input.len == 0:
    echo "Error: no input file specified. Use --help for usage."
    quit(1)

  if cfg.verbose:
    echo "Input:   " & cfg.input
    echo "Output:  " & cfg.output

  if not fileExists(cfg.input):
    echo "Error: file not found: " & cfg.input
    quit(1)

  let content = readFile(cfg.input)
  writeFile(cfg.output, content.toUpper())

  if cfg.verbose:
    echo "Done. Wrote " & $content.len & " bytes to " & cfg.output
  else:
    echo "Done."

main()
`,
      'mytool.nimble': `# Package
version       = "0.1.0"
author        = "Your Name"
description   = "A Nim CLI tool"
license       = "MIT"
srcDir        = "src"
bin           = @["main"]

requires "nim >= 2.0.0"
`,
    },
  },

  {
    id: 'macro',
    name: 'Macro / Metaprogramming',
    icon: '🧩',
    desc: 'Demonstrates Nim macros, templates, and compile-time features',
    files: {
      'src/main.nim': `## Nim metaprogramming examples.
## Nim macros operate on the AST at compile time.

import std/macros
import std/strutils
import std/tables

# ── Template: simple code reuse ──────────────────────────────────────────────
template repeat*(n: int, body: untyped) =
  ## Repeat body n times.
  for _ in 0..<n:
    body

# ── Template: timed block ─────────────────────────────────────────────────────
import std/times

template timed*(label: string, body: untyped) =
  ## Print how long a block takes.
  let t0 = cpuTime()
  body
  echo label & ": " & $(cpuTime() - t0) & "s"

# ── Macro: generate getter/setter pairs ──────────────────────────────────────
macro properties*(T: typedesc, fields: untyped): untyped =
  ## Generate typed getter and setter procs for an object's fields.
  result = newStmtList()
  for field in fields:
    let name = field[0]
    let typ  = field[1]
    result.add quote do:
      proc \`name\`*(self: \`T\`): \`typ\` = self.\`name\`
      proc \`name\`*(self: var \`T\`, val: \`typ\`) = self.\`name\` = val

# ── Compile-time string table ─────────────────────────────────────────────────
const HTTP_CODES = {
  200: "OK",
  201: "Created",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
}.toTable()

proc statusText*(code: int): string =
  HTTP_CODES.getOrDefault(code, "Unknown")

# ── Generic stack ─────────────────────────────────────────────────────────────
type
  Stack*[T] = object
    items: seq[T]

proc newStack*[T](): Stack[T] = Stack[T](items: @[])
proc push*[T](s: var Stack[T], val: T) = s.items.add(val)
proc pop*[T](s: var Stack[T]): T =
  if s.items.len == 0: raise newException(ValueError, "empty stack")
  result = s.items[^1]
  s.items.setLen(s.items.len - 1)
proc peek*[T](s: Stack[T]): T = s.items[^1]
proc len*[T](s: Stack[T]): int = s.items.len

# ── Main ──────────────────────────────────────────────────────────────────────
proc main() =
  # Template usage
  repeat(3):
    echo "Hello from template!"

  timed("Generic Stack"):
    var s = newStack[int]()
    for i in 1..100:
      s.push(i)
    while s.len > 0:
      discard s.pop()

  echo "HTTP 404: " & statusText(404)
  echo "HTTP 200: " & statusText(200)

main()
`,
      'metaprog.nimble': `# Package
version       = "0.1.0"
author        = "Your Name"
description   = "Nim metaprogramming examples"
license       = "MIT"
srcDir        = "src"
bin           = @["main"]

requires "nim >= 2.0.0"
`,
    },
  },
]

// ── Template dialog builder ───────────────────────────────────────────────────
export function buildTemplateDialog() {
  const dlg = document.createElement('div')
  dlg.className = 'dialog-bg hidden'
  dlg.id = 'template-dlg'

  dlg.innerHTML = `<div class="dialog tpl-dialog">
    <div class="dlg-title">New Project from Template</div>
    <div class="tpl-grid" id="tpl-grid"></div>
    <div class="dlg-footer">
      <button class="wbtn" id="tpl-cancel">Cancel</button>
    </div>
  </div>`

  const grid = dlg.querySelector('#tpl-grid')
  TEMPLATES.forEach(tpl => {
    const card = document.createElement('div')
    card.className = 'tpl-card'
    card.innerHTML = `
      <div class="tpl-icon">${tpl.icon}</div>
      <div class="tpl-name">${tpl.name}</div>
      <div class="tpl-desc">${tpl.desc}</div>`
    card.addEventListener('click', () => {
      dlg.classList.add('hidden')
      applyTemplate(tpl)
    })
    grid.appendChild(card)
  })

  dlg.querySelector('#tpl-cancel').addEventListener('click', () => {
    dlg.classList.add('hidden')
  })
  dlg.addEventListener('click', e => {
    if (e.target === dlg) dlg.classList.add('hidden')
  })

  return dlg
}

async function applyTemplate(tpl) {
  const goFn = (method, ...args) => {
    const fn = window?.go?.main?.App?.[method]
    if (fn) return fn(...args)
    return Promise.resolve(null)
  }

  const root = await goFn('GetProjectRoot') || ''
  if (!root) {
    alert('Please open a project folder first (File -> Open Folder)')
    return
  }

  const sep = root.includes('\\') ? '\\' : '/'
  const created = []

  for (const [relPath, content] of Object.entries(tpl.files)) {
    const fullPath = root + sep + relPath.replace(/\//g, sep)
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
    await goFn('CreateDir', dir)
    const err = await goFn('WriteFile', fullPath, content)
    if (!err) created.push({ path: fullPath, name: relPath.split('/').pop(), content })
  }

  window.dispatchEvent(new CustomEvent('ferrum:template-applied', {
    detail: { template: tpl, files: created, root }
  }))
}

// ── Nim error explanations ────────────────────────────────────────────────────
const NIM_ERROR_EXPLANATIONS = [
  // ── Type errors ──────────────────────────────────────────────────────────
  {
    match: /type mismatch: got <(.+?)> but expected <(.+?)>/,
    title: 'Type mismatch',
    explain: m => `You gave a value of type \`${m[1]}\` where type \`${m[2]}\` was expected.`,
    fix: m => `Convert with a cast or conversion proc. E.g. \`${m[2]}(value)\`, or use \`$\` to convert to string.`,
  },
  {
    match: /undeclared identifier: '(.+?)'/,
    title: 'Unknown identifier',
    explain: m => `Nim cannot find anything named \`${m[1]}\` in the current scope.`,
    fix: m => `Check spelling. Did you forget to \`import\` the module? Or declare \`${m[1]}\` before using it.`,
  },
  {
    match: /attempt to assign to a .const. variable/,
    title: 'Assigning to a constant',
    explain: () => `You tried to assign a new value to a \`const\` or \`let\` binding. These are immutable.`,
    fix: () => `Use \`var\` instead of \`let\` or \`const\` if you need to modify the value later.`,
  },
  {
    match: /expression '(.+?)' has no type/,
    title: 'Expression has no type',
    explain: m => `The expression \`${m[1]}\` doesn't produce a value that can be used here.`,
    fix: () => `Make sure you're calling a proc that returns a value, not a void proc.`,
  },
  {
    match: /value of type '(.+?)' has to be discarded/,
    title: 'Unused return value',
    explain: m => `A proc returned a value of type \`${m[1]}\` that you ignored.`,
    fix: () => `Either use the return value, or explicitly discard it with \`discard yourCall()\`.`,
  },
  {
    match: /unused variable: '(.+?)'/,
    title: 'Unused variable',
    explain: m => `Variable \`${m[1]}\` is declared but never used.`,
    fix: m => `Either use the variable, or replace it with \`_\` to suppress the warning: \`let _ = ...\`.`,
  },
  // ── Object / field errors ─────────────────────────────────────────────────
  {
    match: /type '(.+?)' has no field or method named '(.+?)'/,
    title: 'Unknown field or method',
    explain: m => `Type \`${m[1]}\` has no field or method called \`${m[2]}\`.`,
    fix: m => `Check the type definition for available fields. Use your IDE or \`echo typeof(obj)\` to inspect the type.`,
  },
  {
    match: /object has no field named '(.+?)'/,
    title: 'Unknown object field',
    explain: m => `The object has no field called \`${m[1]}\`.`,
    fix: () => `Check the object definition. Field names are case-sensitive in Nim.`,
  },
  // ── Module / import errors ────────────────────────────────────────────────
  {
    match: /cannot open '(.+?)'/,
    title: 'Module not found',
    explain: m => `Nim could not find the module \`${m[1]}\`.`,
    fix: m => `Check the import path. For stdlib use \`import std/${m[1]}\`. For nimble packages, add them to your \`.nimble\` file and run \`nimble install\`.`,
  },
  {
    match: /ambiguous identifier: '(.+?)'/,
    title: 'Ambiguous identifier',
    explain: m => `The name \`${m[1]}\` exists in multiple imported modules.`,
    fix: m => `Qualify it with the module name: \`moduleName.${m[1]}\`.`,
  },
  // ── Nil / ref errors ──────────────────────────────────────────────────────
  {
    match: /unhandled exception: index out of bounds/,
    title: 'Index out of bounds',
    explain: () => `You accessed a sequence or array at an index that doesn't exist.`,
    fix: () => `Check that your index is \`< len(seq)\` before accessing. Use \`if i < s.len: s[i]\`.`,
  },
  {
    match: /unhandled exception: nil access/,
    title: 'Nil pointer access',
    explain: () => `You tried to access a field or method on a \`nil\` reference.`,
    fix: () => `Check for nil before dereferencing: \`if myRef != nil: myRef.field\`.`,
  },
  // ── Async errors ──────────────────────────────────────────────────────────
  {
    match: /expression of type 'Future\[(.+?)\]' must be awaited/,
    title: 'Forgot to await',
    explain: m => `This async call returns a \`Future[${m[1]}]\` that you haven't awaited.`,
    fix: () => `Add \`await\` before the call: \`let result = await myAsyncProc()\`.`,
  },
  // ── Pragma / attribute errors ─────────────────────────────────────────────
  {
    match: /unknown pragma: '(.+?)'/,
    title: 'Unknown pragma',
    explain: m => `The pragma \`{.${m[1]}.}\` is not recognized.`,
    fix: () => `Check the Nim manual for valid pragmas. Common ones: \`{.raises: [].}\`, \`{.inline.}\`, \`{.exportc.}\`.`,
  },
  // ── Integer / arithmetic ──────────────────────────────────────────────────
  {
    match: /over- or underflow/,
    title: 'Integer overflow',
    explain: () => `An arithmetic operation produced a value outside the range of the integer type.`,
    fix: () => `Use a wider type (\`int64\`) or use \`toInt()\` carefully. Wrap with \`uint\` for wrapping arithmetic.`,
  },
  // ── Proc / call errors ────────────────────────────────────────────────────
  {
    match: /wrong number of arguments/,
    title: 'Wrong number of arguments',
    explain: () => `You called a proc with the wrong number of arguments.`,
    fix: () => `Check the proc signature and provide the correct number of arguments.`,
  },
  {
    match: /expression cannot be called/,
    title: 'Not callable',
    explain: () => `You tried to call something that isn't a proc or template.`,
    fix: () => `Make sure you're calling a \`proc\`, \`func\`, \`template\`, or \`macro\`.`,
  },
  // ── Fallback ──────────────────────────────────────────────────────────────
  { match: /.*/, title: null, explain: () => null, fix: () => null },
]

export function explainError(message) {
  for (const entry of NIM_ERROR_EXPLANATIONS) {
    const m = message.match(entry.match)
    if (m) {
      const explain = entry.explain(m)
      if (!explain) return null
      return { title: entry.title, explain, fix: entry.fix(m) }
    }
  }
  return null
}

export function buildEnhancedProblemItem(diag) {
  const explanation = explainError(diag.message)
  const icon = diag.kind === 'error' ? 'x' : diag.kind === 'warning' ? '!' : 'ℹ'
  const kindClass = diag.kind
  const rawMsg = diag.message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const loc = `${diag.file.replace(/\\/g, '/').split('/').pop()}:${diag.line}:${diag.col}`

  if (!explanation) {
    return `<div class="prob-item ${kindClass}" data-a="prob:goto"
        data-file="${diag.file}" data-line="${diag.line}" data-col="${diag.col}">
      <span class="prob-icon">${icon}</span>
      <div class="prob-body">
        <span class="prob-msg">${rawMsg}</span>
        <span class="prob-loc">${loc}</span>
      </div>
    </div>`
  }

  const esc = s => s.replace(/`([^`]+)`/g, '<code class="prob-code">$1</code>')

  return `<div class="prob-item ${kindClass} prob-enhanced" data-a="prob:goto"
      data-file="${diag.file}" data-line="${diag.line}" data-col="${diag.col}">
    <span class="prob-icon">${icon}</span>
    <div class="prob-body">
      <div class="prob-title">${explanation.title}</div>
      <div class="prob-explain">${esc(explanation.explain)}</div>
      <div class="prob-fix"><span class="prob-fix-label">Fix -></span> ${esc(explanation.fix)}</div>
      <div class="prob-raw">${rawMsg}</div>
      <span class="prob-loc">${loc}</span>
    </div>
  </div>`
}
