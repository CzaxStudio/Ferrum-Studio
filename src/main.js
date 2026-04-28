import './style.css'
import { TEMPLATES, buildTemplateDialog, explainError, buildEnhancedProblemItem } from './enhancements.js'

// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO  —  The Nim IDE
// ══════════════════════════════════════════════════════════════════════════════

// ── Wails bridge ──────────────────────────────────────────────────────────────
async function go(method, ...args) {
  const fn = window?.go?.main?.App?.[method]
  if (fn) { try { return await fn(...args) } catch(e) { console.error(method, e); return null } }
  return STUBS[method]?.(...args) ?? null
}
function wOn(ev, fn) { window?.runtime?.EventsOn?.(ev, fn) }

// ── Demo stubs ────────────────────────────────────────────────────────────────
const DEMO = `## Welcome to Ferrum Studio — The Nim IDE
## This is a demo file. Open a real project with File -> Open Folder.

import std/strutils
import std/sequtils
import std/math

# A basic demonstration of Nim syntax

type
  Shape = object
    name*: string
    sides*: int

proc area*(s: Shape, sideLen: float): float =
  ## Calculate area of a regular polygon.
  let n = s.sides.float
  (n * sideLen * sideLen) / (4.0 * tan(PI / n))

proc greet*(name: string): string =
  "Hello, " & name & "! Welcome to Ferrum Studio."

when isMainModule:
  echo greet("Nim Developer")

  let shapes = @[
    Shape(name: "Triangle", sides: 3),
    Shape(name: "Square",   sides: 4),
    Shape(name: "Hexagon",  sides: 6),
  ]

  for s in shapes:
    let a = s.area(5.0)
    echo s.name & " area: " & $a.round(2)

  # Nim sequence operations
  let nums = @[1, 2, 3, 4, 5]
  let doubled = nums.map(proc(x: int): int = x * 2)
  echo "Doubled: " & $doubled
`

const STUBS = {
  OpenFolder:        async () => '',
  OpenFile:          async () => null,
  ReadFile:          async () => DEMO,
  WriteFile:         async () => '',
  SaveFileDialog:    async () => '',
  SaveAs:            async () => '',
  GetFileTree:       async () => ({ name:'ferrum-demo', path:'/demo', isDir:true, ext:'', children:[
    { name:'src', path:'/demo/src', isDir:true, ext:'', children:[
      { name:'main.nim',   path:'/demo/src/main.nim',   isDir:false, ext:'nim' },
      { name:'utils.nim',  path:'/demo/src/utils.nim',  isDir:false, ext:'nim' },
    ]},
    { name:'myapp.nimble', path:'/demo/myapp.nimble', isDir:false, ext:'nimble' },
    { name:'config.nims',  path:'/demo/config.nims',  isDir:false, ext:'nims'   },
    { name:'README.md',    path:'/demo/README.md',    isDir:false, ext:'md'     },
  ]}),
  // Nim-specific methods
  RunNim:            async cmd => { tPrint('\x1b[2m[demo] nim ' + cmd + '\x1b[0m\n'); setTimeout(()=>onNimDone(0), 400) },
  NimCheck:          async () => [],
  NimFmt:            async () => DEMO,
  NimVersion:        async () => '2.0.0',
  GetNimInfo:        async () => ({ version:'2.0.0', path:'/usr/local/bin/nim', os:'linux', arch:'amd64' }),
  GetNimPath:        async () => '/usr/local/bin/nim',
  SetNimPath:        async () => 'stub',
  BrowseForNim:      async () => '',
  RetryNimDetection: async () => ({ version:'2.0.0', path:'nim', os:'linux', arch:'amd64' }),
  // General
  KillProc:          async () => {},
  SendInput:         async () => {},
  GetBuildSteps:     async () => ([
    { name:'build',   desc:'nim c -d:release src/main.nim', kind:'install' },
    { name:'run',     desc:'nim r src/main.nim',            kind:'run'     },
    { name:'test',    desc:'nimble test',                   kind:'test'    },
  ]),
  GetGitStatus:      async () => ({ hasGit:false, branch:'main', modified:[], added:[], untracked:[], deleted:[] }),
  ScaffoldProject:   async () => 'Scaffolded!',
  GetPlatform:       async () => 'linux/amd64',
  GetProjectRoot:    async () => '',
  CreateFile:        async () => '',
  CreateDir:         async () => '',
  DeletePath:        async () => '',
  RenamePath:        async () => '',
}

// ── Syntax highlighter ────────────────────────────────────────────────────────
const ZIG_KW = new Set([
  // Nim keywords
  'addr','and','as','asm','bind','block','break','case','cast','concept',
  'const','continue','converter','defer','discard','distinct','div','do',
  'elif','else','end','enum','except','export','finally','for','from',
  'func','if','import','in','include','interface','is','isnot','iterator',
  'let','macro','method','mixin','mod','nil','not','notin','object','of',
  'or','out','proc','ptr','raise','ref','return','shl','shr','static',
  'template','try','tuple','type','using','var','when','while','xor','yield',
])
const ZIG_TY = new Set([
  // Nim built-in types
  'int','int8','int16','int32','int64','uint','uint8','uint16','uint32',
  'uint64','float','float32','float64','bool','char','string','byte',
  'Natural','Positive','BiggestInt','BiggestFloat','cint','clong','culong',
  'cstring','pointer','void','auto','any','untyped','typed',
  'varargs','openArray','seq','array','set','range','Slice',
  'true','false','nil',
])

const NIM_KW = ZIG_KW  // alias
const NIM_TY = ZIG_TY  // alias

// Bracket pair colors (per nesting depth 0–4 then cycles)
const BR_COLORS = ['#f97316','#60a5fa','#4ade80','#c084fc','#fbbf24']

function hlCode(code) {
  const lines = code.split('\n')
  let depth = 0 // bracket nesting depth across lines
  return lines.map(line => {
    const [html, newDepth] = hlLine(line, depth)
    depth = newDepth
    return `<div class="cl">${html}</div>`
  }).join('')
}

// Hoisted constants — allocated once, not on every hlLine call
const _brOpen  = new Set(['(','[','{'])
const _brClose = new Set([')',']','}'])
const _opRx    = /[+\-*%=<>!&|^~?:;,.]/
// Escape HTML without regex allocation per call
function _esc(s) {
  let o = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '&') o += '&amp;'
    else if (c === '<') o += '&lt;'
    else if (c === '>') o += '&gt;'
    else o += c
  }
  return o
}

function hlLine(raw, depthIn) {
  let out = '', i = 0, n = raw.length
  let depth = depthIn
  const tok = (cls, val) => { out += '<span class="' + cls + '">' + _esc(val) + '</span>' }

  while (i < n) {
    const c = raw[i]

    // Nim doc comment ##
    if (c==='#'&&raw[i+1]==='#') {
      tok('hdc', raw.slice(i)); break
    }
    // Nim line comment #
    if (c==='#') {
      tok('hc', raw.slice(i)); break
    }
    // String "..."
    if (c==='"') {
      let j=i+1
      while(j<n){ if(raw[j]==='"'&&raw[j-1]!=='\\'){j++;break}; j++ }
      tok('hs', raw.slice(i,j)); i=j; continue
    }
    // Char literal
    if (c==="'") {
      let j=i+1
      while(j<n){ if(raw[j]==="'"&&raw[j-1]!=='\\'){j++;break}; j++ }
      tok('hs', raw.slice(i,j)); i=j; continue
    }
    // Nim triple-quoted string (starts with """ on previous line, we just highlight rest)
    // Raw strings: r"..." — handled by the normal string case below
    // Nim @ operator (seq constructor, address-of) — treat as operator
    if (c==='@') {
      tok('hop', c); i++; continue
    }
    // Numbers
    if (c>='0'&&c<='9') {
      const m=raw.slice(i).match(/^0x[0-9a-fA-F_]+|^0b[01_]+|^0o[0-7_]+|^[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?/)
      if(m){ tok('hn',m[0]); i+=m[0].length; continue }
    }
    // Words
    if ((c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_') {
      let j=i+1; while(j<n){const _wc=raw.charCodeAt(j);if((_wc>=97&&_wc<=122)||(_wc>=65&&_wc<=90)||(_wc>=48&&_wc<=57)||_wc===95)j++;else break}
      const w=raw.slice(i,j), next=raw[j]
      if      (ZIG_KW.has(w)) tok('hk',w)
      else if (ZIG_TY.has(w)) tok('ht',w)
      else if (/^[A-Z]/.test(w)) tok('hT',w)
      else if (next==='(')    tok('hf',w)
      else                    tok('hi',w)
      i=j; continue
    }
    // Bracket pair colorization
    if (_brOpen.has(c)) {
      const col = BR_COLORS[depth % BR_COLORS.length]
      out += '<span class="hbr" style="color:' + col + '">' + _esc(c) + '</span>'
      depth++; i++; continue
    }
    if (_brClose.has(c)) {
      depth = Math.max(0, depth-1)
      const col = BR_COLORS[depth % BR_COLORS.length]
      out += '<span class="hbr" style="color:' + col + '">' + _esc(c) + '</span>'
      i++; continue
    }
    // Operators & punctuation
    if (/[+\-*%=<>!&|^~?:;,.]/.test(c)) tok('hop',c)
    else tok('hp',c)
    i++
  }
  return [out || ' ', depth]
}

// ── Nim snippets ──────────────────────────────────────────────────────────────
const SNIPPETS = [
  // [trigger, display, body]  $0 = cursor  $1,$2 = tab stops
  ['proc',   'proc name(args): ReturnType',   'proc $1($2): $3 =\n  $0'],
  ['func',   'func name(args): ReturnType',   'func $1($2): $3 =\n  $0'],
  ['main',   'proc main() + call',            'proc main() =\n  $0\n\nmain()'],
  ['type',   'type block',                    'type\n  $1 = object\n    $0'],
  ['obj',    'object type',                   'type\n  $1* = object\n    $0: int'],
  ['ref',    'ref object type',               'type\n  $1* = ref object\n    $0: int'],
  ['enum',   'enum type',                     'type\n  $1 = enum\n    $0'],
  ['tup',    'tuple type',                    'type\n  $1 = tuple\n    x: int\n    y: int\n$0'],
  ['if',     'if statement',                  'if $1:\n  $0'],
  ['ife',    'if/else statement',             'if $1:\n  $0\nelse:\n  discard'],
  ['elif',   'if/elif/else',                  'if $1:\n  $0\nelif $2:\n  discard\nelse:\n  discard'],
  ['for',    'for loop',                      'for $1 in $2:\n  $0'],
  ['fori',   'for loop with index',           'for i, $1 in pairs($2):\n  $0'],
  ['while',  'while loop',                    'while $1:\n  $0'],
  ['case',   'case statement',                'case $1:\nof $2:\n  $0\nelse:\n  discard'],
  ['try',    'try/except',                    'try:\n  $0\nexcept $1 as e:\n  echo e.msg'],
  ['tmpl',   'template definition',           'template $1($2: typed): untyped =\n  $0'],
  ['mac',    'macro definition',              'macro $1($2: untyped): untyped =\n  result = $0'],
  ['iter',   'iterator definition',           'iterator $1($2): $3 =\n  yield $0'],
  ['test',   'unittest block',                'suite "$1":\n  test "$2":\n    check $0'],
  ['imp',    'import statement',              'import $0'],
  ['inc',    'include statement',             'include $0'],
  ['echo',   'echo statement',               'echo $0'],
  ['fmt',    'fmt string',                    'fmt"$0"'],
  ['seq',    'seq variable',                  'var $1: seq[$2] = @[$0]'],
  ['tbl',    'Table init',                    'var $1 = initTable[string, $2]()\n$0'],
  ['new',    'new ref object',                'let $1 = new($2)\n$0'],
  ['assert', 'assert statement',              'assert $0, "$1"'],
  ['doc',    'doc comment',                   '## $0'],
  ['discard','discard statement',             'discard $0'],
]
function trySnippet(ta) {
  const { selectionStart: pos, value: v } = ta
  const lineStart = v.lastIndexOf('\n', pos-1)+1
  const before = v.slice(lineStart, pos)
  // Find longest matching trigger
  let best = null
  for (const [trigger] of SNIPPETS) {
    if (before.endsWith(trigger) && (!best || trigger.length > best.length)) best = trigger
  }
  if (!best) return false
  const [,, body] = SNIPPETS.find(([t]) => t===best)
  const start = pos - best.length
  // Strip $N placeholders, find $0 position
  const cursor0Pos = body.indexOf('$0')
  const beforeCursor = cursor0Pos >= 0 ? body.slice(0, cursor0Pos).replace(/\$\d/g,'') : ''
  const expanded = body.replace(/\$\d/g,'')
  ta.value = v.slice(0,start) + expanded + v.slice(pos)
  ta.selectionStart = ta.selectionEnd = start + beforeCursor.length
  ta.dispatchEvent(new Event('input'))
  return true
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
// Pattern-based completions — no LSP needed
// ── IntelliSense completion database — Nim stdlib ────────────────────────────
// dot-chain aware: items with '.' only appear after typing that prefix
const COMPLETE_ITEMS = [
  // ── Top-level modules ──────────────────────────────────────────────────────
  { label:'std/strutils',   detail:'String utilities — split, strip, replace, toUpper', kind:'module' },
  { label:'std/sequtils',   detail:'Sequence utilities — map, filter, foldl, zip',     kind:'module' },
  { label:'std/tables',     detail:'Hash tables — Table, OrderedTable, CountTable',    kind:'module' },
  { label:'std/sets',       detail:'Hash sets — HashSet, toHashSet, incl, excl',       kind:'module' },
  { label:'std/os',         detail:'OS — getEnv, sleep, existsFile, getCurrentDir',    kind:'module' },
  { label:'std/osproc',     detail:'Processes — startProcess, execCmd, waitForExit',  kind:'module' },
  { label:'std/strformat',  detail:'Formatted strings — fmt"interpolation"',           kind:'module' },
  { label:'std/strscans',   detail:'String scanning — scanf, scanTuple',               kind:'module' },
  { label:'std/math',       detail:'Math — sqrt, pow, sin, cos, ceil, floor, PI',      kind:'module' },
  { label:'std/sugar',      detail:'Sugar — =>, dup, collect, capture',               kind:'module' },
  { label:'std/options',    detail:'Option type — some(), none(), isSome, get',        kind:'module' },
  { label:'std/results',    detail:'Result type — ok(), err(), isOk, value',           kind:'module' },
  { label:'std/asyncdispatch', detail:'Async — async, await, waitFor, newAsyncSocket',kind:'module' },
  { label:'std/asyncnet',   detail:'Async networking — AsyncSocket, dial, newServer',  kind:'module' },
  { label:'std/net',        detail:'Networking — Socket, newSocket, connect, bind',    kind:'module' },
  { label:'std/httpclient', detail:'HTTP client — newHttpClient, get, post',           kind:'module' },
  { label:'std/json',       detail:'JSON — parseJson, %*, to(), JsonNode',             kind:'module' },
  { label:'std/xmlparser',  detail:'XML parsing — parseXml, XmlNode',                 kind:'module' },
  { label:'std/re',         detail:'Regex — match, find, replace, split, Regex',       kind:'module' },
  { label:'std/times',      detail:'Date/time — now, getTime, format, Duration',       kind:'module' },
  { label:'std/random',     detail:'Random — rand, shuffle, sample, initRand',         kind:'module' },
  { label:'std/terminal',   detail:'Terminal — styledEcho, setForegroundColor',        kind:'module' },
  { label:'std/logging',    detail:'Logging — newConsoleLogger, log, debug, info',     kind:'module' },
  { label:'std/unittest',   detail:'Unit tests — suite, test, check, expect',          kind:'module' },
  { label:'std/typetraits', detail:'Type traits — name, genericParams, isNamedTuple',  kind:'module' },
  { label:'std/macros',     detail:'Macro API — NimNode, newTree, nnkStmtList',        kind:'module' },
  { label:'std/genasts',    detail:'AST generation — genAst, genStmts',               kind:'module' },
  { label:'std/enumerate',  detail:'enumerate() iterator',                             kind:'module' },
  { label:'std/algorithm',  detail:'Sorting — sort, sorted, reverse, binarySearch',   kind:'module' },
  { label:'std/deques',     detail:'Double-ended queue — Deque, addFirst, addLast',   kind:'module' },
  { label:'std/heapqueue',  detail:'Priority queue — HeapQueue, push, pop, len',      kind:'module' },
  { label:'std/bitops',     detail:'Bit operations — popcount, countLeadingZeroBits', kind:'module' },
  { label:'std/parsecsv',   detail:'CSV parsing — CsvParser, open, readRow',          kind:'module' },
  { label:'std/parsecfg',   detail:'INI/cfg parsing — loadConfig, getSectionValue',   kind:'module' },
  { label:'std/streams',    detail:'I/O streams — StringStream, FileStream, read*',   kind:'module' },
  { label:'std/memfiles',   detail:'Memory-mapped files — open, mapMem',              kind:'module' },
  { label:'std/nativesockets', detail:'Low-level socket API',                         kind:'module' },
  { label:'std/isolation',  detail:'Thread isolation — Isolated, extract',            kind:'module' },
  { label:'std/locks',      detail:'Locks & conditions — Lock, acquire, release',     kind:'module' },
  { label:'std/system',     detail:'Always imported — echo, len, add, inc, dec, new', kind:'module' },
  // ── strutils procs ─────────────────────────────────────────────────────────
  { label:'split',         detail:'(s, sep): seq[string]',                            kind:'fn' },
  { label:'strip',         detail:'(s): string — trim whitespace',                    kind:'fn' },
  { label:'replace',       detail:'(s, sub, by): string',                             kind:'fn' },
  { label:'toLower',       detail:'(s): string',                                       kind:'fn' },
  { label:'toUpper',       detail:'(s): string',                                       kind:'fn' },
  { label:'contains',      detail:'(s, sub): bool',                                   kind:'fn' },
  { label:'startsWith',    detail:'(s, prefix): bool',                                kind:'fn' },
  { label:'endsWith',      detail:'(s, suffix): bool',                                kind:'fn' },
  { label:'parseInt',      detail:'(s): int',                                         kind:'fn' },
  { label:'parseFloat',    detail:'(s): float',                                       kind:'fn' },
  { label:'join',          detail:'(parts, sep): string',                             kind:'fn' },
  { label:'repeat',        detail:'(s, n): string',                                   kind:'fn' },
  { label:'format',        detail:'(fmt, args): string',                              kind:'fn' },
  { label:'removePrefix',  detail:'(s, prefix): string',                              kind:'fn' },
  { label:'removeSuffix',  detail:'(s, suffix): string',                              kind:'fn' },
  { label:'indent',        detail:'(s, count): string',                               kind:'fn' },
  // ── sequtils procs ─────────────────────────────────────────────────────────
  { label:'map',           detail:'(s, f): seq  — transform each element',            kind:'fn' },
  { label:'filter',        detail:'(s, pred): seq  — keep matching elements',         kind:'fn' },
  { label:'foldl',         detail:'(s, op, initial)  — reduce left',                 kind:'fn' },
  { label:'foldr',         detail:'(s, op, initial)  — reduce right',                kind:'fn' },
  { label:'any',           detail:'(s, pred): bool',                                  kind:'fn' },
  { label:'all',           detail:'(s, pred): bool',                                  kind:'fn' },
  { label:'zip',           detail:'(a, b): seq[tuple]',                               kind:'fn' },
  { label:'unzip',         detail:'(s): (seq, seq)',                                  kind:'fn' },
  { label:'deduplicate',   detail:'(s): seq  — remove duplicates',                   kind:'fn' },
  { label:'flatten',       detail:'(s): seq  — flatten one level',                   kind:'fn' },
  // ── tables procs ───────────────────────────────────────────────────────────
  { label:'initTable',     detail:'[K,V](): Table[K,V]',                              kind:'fn' },
  { label:'initOrderedTable', detail:'[K,V](): OrderedTable[K,V]',                   kind:'fn' },
  { label:'initCountTable', detail:'[K](): CountTable[K]',                            kind:'fn' },
  { label:'toTable',       detail:'(pairs): Table',                                   kind:'fn' },
  { label:'hasKey',        detail:'(t, key): bool',                                   kind:'fn' },
  { label:'getOrDefault',  detail:'(t, key, default): V',                            kind:'fn' },
  { label:'keys',          detail:'(t): iterator of K',                               kind:'fn' },
  { label:'values',        detail:'(t): iterator of V',                               kind:'fn' },
  { label:'pairs',         detail:'(t): iterator of (K, V)',                          kind:'fn' },
  // ── system / built-ins ─────────────────────────────────────────────────────
  { label:'echo',          detail:'(args) — print to stdout with newline',            kind:'fn' },
  { label:'debugEcho',     detail:'(args) — always print regardless of -d:release',  kind:'fn' },
  { label:'inc',           detail:'(x) — increment variable',                        kind:'fn' },
  { label:'dec',           detail:'(x) — decrement variable',                        kind:'fn' },
  { label:'new',           detail:'(T): ref T — allocate ref object',                kind:'fn' },
  { label:'newSeq',        detail:'[T](len): seq[T]',                                 kind:'fn' },
  { label:'newString',     detail:'(len): string',                                    kind:'fn' },
  { label:'len',           detail:'(s): int',                                         kind:'fn' },
  { label:'high',          detail:'(s): int — last valid index',                     kind:'fn' },
  { label:'low',           detail:'(s): int — first valid index',                    kind:'fn' },
  { label:'add',           detail:'(s, item) — append to seq/string',                kind:'fn' },
  { label:'del',           detail:'(s, i) — delete element at index',                kind:'fn' },
  { label:'pop',           detail:'(s): T — remove and return last',                 kind:'fn' },
  { label:'insert',        detail:'(s, item, i) — insert at index',                  kind:'fn' },
  { label:'contains',      detail:'(s, item): bool',                                  kind:'fn' },
  { label:'repr',          detail:'(x): string — debug representation',              kind:'fn' },
  { label:'typeof',        detail:'(x): type — type of expression',                  kind:'fn' },
  { label:'ord',           detail:'(x): int — ordinal value',                        kind:'fn' },
  { label:'chr',           detail:'(i): char',                                        kind:'fn' },
  { label:'succ',          detail:'(x): T — successor',                              kind:'fn' },
  { label:'pred',          detail:'(x): T — predecessor',                            kind:'fn' },
  { label:'swap',          detail:'(a, b) — swap values',                            kind:'fn' },
  { label:'min',           detail:'(a, b): T',                                        kind:'fn' },
  { label:'max',           detail:'(a, b): T',                                        kind:'fn' },
  { label:'abs',           detail:'(x): T — absolute value',                         kind:'fn' },
  { label:'clamp',         detail:'(x, lo, hi): T',                                  kind:'fn' },
  { label:'isNil',         detail:'(x): bool — check for nil',                       kind:'fn' },
  { label:'quit',          detail:'(code=0) — exit program',                         kind:'fn' },
  // ── keywords (NIM_KW) ──────────────────────────────────────────────────────
  ...Array.from(NIM_KW).map(k => ({ label:k, detail:'Nim keyword',   kind:'keyword' })),
  // ── built-in types (NIM_TY) ────────────────────────────────────────────────
  ...Array.from(NIM_TY).map(t => ({ label:t, detail:'Built-in type', kind:'type' })),
]
// Build a prefix-indexed trie for O(1) lookup instead of scanning all items
const AC_INDEX = new Map()
COMPLETE_ITEMS.forEach(item => {
  const label = item.label.toLowerCase()
  for (let len = 1; len <= label.length; len++) {
    const prefix = label.slice(0, len)
    if (!AC_INDEX.has(prefix)) AC_INDEX.set(prefix, [])
    AC_INDEX.get(prefix).push(item)
  }
})

const AC = {
  open: false,
  items: [],
  idx: 0,
  word: '',
  wordStart: 0,
}

function acUpdate(ta) {
  const { selectionStart: pos, value: v } = ta
  // Scan back to find current token (word chars + . + @)
  let start = pos
  while (start > 0 && /[\w.@]/.test(v[start-1])) start--
  const word = v.slice(start, pos)
  AC.word = word; AC.wordStart = start

  // @ triggers at 1 char (builtins list), everything else at 2+ chars
  const minLen = word.startsWith('@') ? 1 : 2
  if (word.length < minLen) { acClose(); return }

  const q = word.toLowerCase()

  // Use index for fast prefix lookup
  let matches = AC_INDEX.get(q) || []

  // Also do substring match for dot-chains: "std.i" should find std.io, std.io.getStdOut etc
  if (!matches.length || word.includes('.')) {
    matches = COMPLETE_ITEMS.filter(it => {
      const lbl = it.label.toLowerCase()
      return lbl.startsWith(q) && lbl !== q
    })
  }

  // De-duplicate and limit
  const seen = new Set()
  matches = matches.filter(it => {
    if (seen.has(it.label)) return false
    seen.add(it.label); return true
  }).slice(0, 12)

  if (!matches.length) { acClose(); return }
  AC.items = matches; AC.idx = 0; AC.open = true
  acRender(ta)
}

function acRender(ta) {
  let popup = document.getElementById('ac-popup')
  if (!popup) {
    popup = document.createElement('div')
    popup.id = 'ac-popup'
    popup.className = 'ac-popup'
    document.body.appendChild(popup)
  }
  popup.innerHTML = AC.items.map((it,i) => `
    <div class="ac-item${i===AC.idx?' selected':''}" data-idx="${i}">
      <span class="ac-kind ac-${it.kind}">${it.kind[0].toUpperCase()}</span>
      <span class="ac-label">${escH(it.label)}</span>
      <span class="ac-detail">${escH(it.detail)}</span>
    </div>`).join('')

  // Position near cursor
  // Position popup below the current cursor line
  const beforeCursor = ta.value.slice(0, ta.selectionStart)
  const lines = beforeCursor.split('\n')
  const lineNo = lines.length
  const col = lines[lineNo - 1].length
  const pane = document.getElementById('code-pane')
  const pr = pane?.getBoundingClientRect() || { left: 0, top: 0 }
  const charW = 7.4  // char width at 13px monospace
  const x = pr.left + 54 + col * charW - (pane?.scrollLeft || 0)
  const y = pr.top + 12 + lineNo * 22 - (pane?.scrollTop || 0)
  const popupW = 320
  popup.style.left = Math.min(x, window.innerWidth - popupW - 8) + 'px'
  popup.style.top  = Math.min(y + 2, window.innerHeight - 200) + 'px'

  // Click on item
  popup.querySelectorAll('.ac-item').forEach(row => {
    row.addEventListener('mousedown', e => {
      e.preventDefault()
      AC.idx = parseInt(row.dataset.idx)
      acAccept(ta)
    })
  })
}

function acAccept(ta) {
  if (!AC.open || !AC.items[AC.idx]) return
  const item = AC.items[AC.idx]
  const v = ta.value
  ta.value = v.slice(0, AC.wordStart) + item.label + v.slice(ta.selectionStart)
  ta.selectionStart = ta.selectionEnd = AC.wordStart + item.label.length
  ta.dispatchEvent(new Event('input'))
  acClose()
}

function acMove(dir) {
  if (!AC.open) return false
  AC.idx = Math.max(0, Math.min(AC.items.length-1, AC.idx+dir))
  document.querySelectorAll('.ac-item').forEach((el,i) => el.classList.toggle('selected', i===AC.idx))
  document.querySelectorAll('.ac-item')[AC.idx]?.scrollIntoView({ block:'nearest' })
  return true
}

function acClose() {
  AC.open = false
  const p = document.getElementById('ac-popup')
  if (p) p.remove()
}

// Font size — declared here so boot() can read it


// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  tabs: [], activeTab: null,
  tree: null, expanded: new Set(),
  sbW: 240, termH: 250, drag: null,
  nimInfo: { version:'…', path:'', os:'', arch:'' },
  running: false,
  diagsByFile: {},
  gitStatus: { hasGit:false, branch:'main', modified:[], added:[], untracked:[], deleted:[] },
  buildSteps: [],
  termHistory: [], termHistIdx: -1,
  findMatches: [], findIdx: 0,
  ctxNode: null,
  checkTimer: null,
  activePanel: 'terminal',  // 'terminal'|'problems'|'tests'|'build'
  testResults: [],
  foldedLines: new Set(),
  _hlTimer: 0,
  _acTimer: 0,
  _lastLineCount: 0,
  _mmTimer: 0,
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
function mk(t,c){ const e=document.createElement(t); if(c)e.className=c; return e }
function mkt(t,c,tx){ const e=mk(t,c); e.textContent=tx; return e }
function escH(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function bn(p){ return (p||'').replace(/\\/g,'/').split('/').pop() }
function langOf(p){ return (p||'').endsWith('.nim')||(p||'').endsWith('.nims')||(p||'').endsWith('.nimble')?'nim':'text' }
function extOf(n){ const i=n.lastIndexOf('.'); return i>=0?n.slice(i+1):'' }

function recent() {
  try { return JSON.parse(localStorage.getItem('f:recent')||'[]') }
  catch { return [] }
}
function pushRecent(p) {
  const r = recent().filter(x=>x!==p)
  r.unshift(p)
  try { localStorage.setItem('f:recent', JSON.stringify(r.slice(0,20))) } catch {}
}




// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO — KILLER FEATURES
//  1. Zig Stdlib Browser — searchable docs for every std module
//  2. Settings Panel — theme, font size, tab size, minimap toggle
//  3. Minimap — right-side code overview
//  4. True Multi-cursor — Ctrl+D adds cursor at next match
//  5. Memory leak detection — parse GPA output automatically
//  6. Font zoom — Ctrl+= / Ctrl+-
//  7. Zig version switcher — switch between installed Zig versions
// ══════════════════════════════════════════════════════════════════════════════

// ── Settings state ─────────────────────────────────────────────────────────
// Font size — must be before boot()
let _fontSize = parseInt(localStorage.getItem('ferrum-fontsize') || '13', 10)

const PREFS = {
  fontSize:  parseInt(localStorage.getItem('fs:fontSize')  || '13'),
  tabSize:   parseInt(localStorage.getItem('fs:tabSize')   || '4'),
  minimap:   localStorage.getItem('fs:minimap') !== 'false',
  theme:     localStorage.getItem('fs:theme') || 'dark',
  lineWrap:  localStorage.getItem('fs:lineWrap') === 'true',
}

function savePrefs() {
  localStorage.setItem('fs:fontSize', PREFS.fontSize)
  localStorage.setItem('fs:tabSize',  PREFS.tabSize)
  localStorage.setItem('fs:minimap',  PREFS.minimap)
  localStorage.setItem('fs:theme',    PREFS.theme)
  localStorage.setItem('fs:lineWrap', PREFS.lineWrap)
}

function applyPrefs() {
  // Font size
  const fs = Math.max(10, Math.min(24, PREFS.fontSize))
  const lh = Math.round(fs * 1.692)  // maintains 22/13 ratio
  document.documentElement.style.setProperty('--fs-editor', fs + 'px')
  document.documentElement.style.setProperty('--lh', lh + 'px')
  const editorEls = document.querySelectorAll('#editor-ta, .hl')
  editorEls.forEach(el => { el.style.fontSize = fs + 'px'; el.style.lineHeight = lh + 'px' })

  // Tab size
  const ts = PREFS.tabSize
  document.querySelectorAll('#editor-ta, .hl').forEach(el => el.style.tabSize = ts)

  // Minimap
  const mm = document.getElementById('minimap')
  if (mm) mm.style.display = PREFS.minimap ? 'block' : 'none'

  // Theme
  applyTheme(PREFS.theme)
}

const THEMES = {
  dark: {
    '--bg':'#0c0c12','--bg1':'#111119','--bg2':'#17171f','--bg3':'#1e1e28','--bg4':'#252533',
    '--bdr':'#252535','--bdr2':'#353550',
    '--tx0':'#ededf5','--tx1':'#9090b0','--tx2':'#505068',
    '--acc':'#f97316',
    '--hk':'#c084fc','--ht':'#4ade80','--hT':'#67e8f9','--hb':'#60a5fa',
    '--hs':'#fbbf24','--hn':'#fb923c','--hc':'#44445a','--hf':'#e2e8f0',
  },
  light: {
    '--bg':'#f8f8fc','--bg1':'#f0f0f6','--bg2':'#e8e8f0','--bg3':'#dcdce8','--bg4':'#c8c8d8',
    '--bdr':'#d0d0e0','--bdr2':'#b8b8cc',
    '--tx0':'#1a1a2e','--tx1':'#4a4a6a','--tx2':'#8888aa',
    '--acc':'#e55a00',
    '--hk':'#7c3aed','--ht':'#16a34a','--hT':'#0891b2','--hb':'#2563eb',
    '--hs':'#b45309','--hn':'#c2410c','--hc':'#9ca3af','--hf':'#111827',
  },
  monokai: {
    '--bg':'#272822','--bg1':'#1e1f1c','--bg2':'#2d2e27','--bg3':'#35362e','--bg4':'#414237',
    '--bdr':'#414237','--bdr2':'#55564a',
    '--tx0':'#f8f8f2','--tx1':'#cfcfc2','--tx2':'#75715e',
    '--acc':'#fd971f',
    '--hk':'#f92672','--ht':'#66d9e8','--hT':'#a6e22e','--hb':'#ae81ff',
    '--hs':'#e6db74','--hn':'#ae81ff','--hc':'#75715e','--hf':'#a6e22e',
  },
  oceanic: {
    '--bg':'#1b2b34','--bg1':'#1b2b34','--bg2':'#223040','--bg3':'#2a3f4f','--bg4':'#344d5e',
    '--bdr':'#2f4555','--bdr2':'#3d5568',
    '--tx0':'#cdd3de','--tx1':'#99a9b4','--tx2':'#5a7080',
    '--acc':'#6699cc',
    '--hk':'#c594c5','--ht':'#99c794','--hT':'#5fb3b3','--hb':'#6699cc',
    '--hs':'#99c794','--hn':'#f99157','--hc':'#5a7080','--hf':'#cdd3de',
  },
}

function applyTheme(name) {
  const t = THEMES[name] || THEMES.dark
  const root = document.documentElement
  Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v))
  // Update syntax token colors
  const style = document.getElementById('theme-tokens') || (() => {
    const s = document.createElement('style'); s.id = 'theme-tokens'; document.head.appendChild(s); return s
  })()
  style.textContent = [
    `.hk{color:${t['--hk']};font-weight:500}`,
    `.ht{color:${t['--ht']}}`,
    `.hT{color:${t['--hT']}}`,
    `.hb{color:${t['--hb']}}`,
    `.hs{color:${t['--hs']}}`,
    `.hn{color:${t['--hn']}}`,
    `.hc{color:${t['--hc']};font-style:italic}`,
    `.hdc{color:${t['--hc']};font-style:italic}`,
    `.hf{color:${t['--hf']}}`,
    `.hi{color:${t['--tx0']}}`,
  ].join('\n')
}

// ── Settings panel ─────────────────────────────────────────────────────────
function buildSettingsPanel() {
  const wrap = mk('div', 'sb-panel-inner')
  const hdr = mk('div', 'sb-hdr')
  hdr.innerHTML = '<span class="sb-title">SETTINGS</span>'
  wrap.appendChild(hdr)

  const body = mk('div', 'settings-body')

  // Theme
  body.innerHTML = `
    <div class="setting-group">
      <div class="setting-label">Color Theme</div>
      <div class="setting-themes">
        ${Object.keys(THEMES).map(t =>
          `<button class="theme-btn${PREFS.theme===t?' active':''}" data-theme="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
        ).join('')}
      </div>
    </div>
    <div class="setting-group">
      <div class="setting-label">Font Size <span class="setting-val" id="fs-val">${PREFS.fontSize}px</span></div>
      <input type="range" class="setting-range" id="fs-range" min="10" max="22" value="${PREFS.fontSize}">
      <div class="setting-hint">Ctrl+= / Ctrl+- to zoom</div>
    </div>
    <div class="setting-group">
      <div class="setting-label">Tab Size <span class="setting-val" id="ts-val">${PREFS.tabSize}</span></div>
      <div class="setting-row">
        ${[2,4,8].map(n => `<button class="tab-size-btn${PREFS.tabSize===n?' active':''}" data-ts="${n}">${n} spaces</button>`).join('')}
      </div>
    </div>
    <div class="setting-group">
      <div class="setting-label">Minimap</div>
      <label class="toggle-label">
        <input type="checkbox" id="minimap-toggle" ${PREFS.minimap?'checked':''}>
        <span class="toggle-track"></span>
        <span class="toggle-text">Show minimap</span>
      </label>
    </div>
    <div class="setting-group">
      <div class="setting-label">Nim Path</div>
      <div class="setting-zig-path" id="nim-path-display" style="font-family:var(--mono);font-size:11px;color:var(--tx2);padding:4px 0;word-break:break-all"></div>
      <div class="setting-row" style="margin-top:6px">
        <button class="wbtn small" id="settings-retry-nim">R Retry detect</button>
        <button class="wbtn small" id="settings-browse-nim">Browse...</button>
      </div>
    </div>
    <div class="setting-group">
      <div class="setting-label">About</div>
      <div class="setting-hint">Ferrum Studio — The Nim IDE</div>
      <div class="setting-hint">Built with Wails + Go + Vanilla JS</div>
      <div class="setting-hint">Open source. Made for Nim developers.</div>
      <div class="setting-hint">Made by Czax. Follow me on GitHub --> https://github.com/CzaxStudio</div>
      <div class="setting-hint">Special thanks to Claude AI and VS Code.</div>
    </div>`

  wrap.appendChild(body)

  // Wire events after insertion
  setTimeout(() => {
    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PREFS.theme = btn.dataset.theme
        savePrefs(); applyPrefs()
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === PREFS.theme))
      })
    })
    // Font size range
    const fsr = document.getElementById('fs-range')
    const fsv = document.getElementById('fs-val')
    fsr?.addEventListener('input', () => {
      PREFS.fontSize = parseInt(fsr.value)
      if (fsv) fsv.textContent = PREFS.fontSize + 'px'
      savePrefs(); applyPrefs()
      // Resize textarea to match new font metrics
      const tab = activeTab()
      if (tab) setTimeout(() => resizeTextarea(tab), 60)
    })
    // Tab size buttons
    document.querySelectorAll('.tab-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PREFS.tabSize = parseInt(btn.dataset.ts)
        savePrefs(); applyPrefs()
        document.querySelectorAll('.tab-size-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.ts) === PREFS.tabSize))
        document.getElementById('ts-val').textContent = PREFS.tabSize
      })
    })
    // Minimap toggle
    document.getElementById('minimap-toggle')?.addEventListener('change', e => {
      PREFS.minimap = e.target.checked
      savePrefs(); applyPrefs()
    })
    // Zig path display
    const zpd = document.getElementById('nim-path-display')
    if (zpd) zpd.textContent = S.nimInfo?.path || 'not found'
    // Retry / Browse
    document.getElementById('settings-retry-nim')?.addEventListener('click', async () => {
      const info = await go('RetryNimDetection')
      updateNimBadge(info)
      if (document.getElementById('nim-path-display')) document.getElementById('nim-path-display').textContent = info?.path || 'not found'
      tLine(info?.version !== 'not found' ? 'Nim: ' + info.version : 'Still not found', info?.version !== 'not found' ? '#4ade80' : '#f87171')
    })
    document.getElementById('settings-browse-nim')?.addEventListener('click', async () => {
      const ver = await go('BrowseForNim')
      if (ver && !ver.startsWith('not') && !ver.startsWith('error')) {
        const info = await go('GetNimInfo'); updateNimBadge(info)
        if (document.getElementById('nim-path-display')) document.getElementById('nim-path-display').textContent = info?.path || ''
        tLine('Nim set: ' + ver, '#4ade80')
      }
    })
  }, 0)
  return wrap
}

// ── Zig Stdlib Docs Browser ─────────────────────────────────────────────────
const STD_DOCS = [
  { name:'system',      desc:'Auto-imported — echo, len, add, inc, new, quit, assert',
    members:['echo(args)',
             'len(s): int',
             'add(s: var seq, item)',
             'del(s: var seq, i)',
             'pop(s: var seq): T',
             'inc(x: var int)',
             'dec(x: var int)',
             'new(T): ref T',
             'newSeq[T](len): seq[T]',
             'newString(len): string',
             'high(s): int',
             'low(s): int',
             'ord(x): int',
             'chr(i): char',
             'repr(x): string',
             'isNil(x): bool',
             'sizeof(x): int',
             'typeof(x): type',
             'swap(a, b)',
             'min(a, b): T',
             'max(a, b): T',
             'abs(x): T',
             'clamp(x, lo, hi): T',
             'quit(code=0)',
             'assert(cond, msg)',
             'doAssert(cond, msg)',
             'when nimvm: — compile-time branch'] },

  { name:'std/strutils', desc:'String utilities',
    members:['split(s, sep): seq[string]',
             'splitWhitespace(s): seq[string]',
             'strip(s): string',
             'strip(s, leading, trailing, chars): string',
             'replace(s, sub, by): string',
             'toLower(s): string',
             'toUpper(s): string',
             'capitalize(s): string',
             'contains(s, sub): bool',
             'startsWith(s, prefix): bool',
             'endsWith(s, suffix): bool',
             'parseInt(s): int',
             'parseBiggestInt(s): BiggestInt',
             'parseFloat(s): float',
             'parseBool(s): bool',
             'join(parts: seq, sep): string',
             'repeat(s, n): string',
             'indent(s, count): string',
             'dedent(s): string',
             'removePrefix(s, prefix)',
             'removeSuffix(s, suffix)',
             'count(s, sub): int',
             'find(s, sub, start, last): int',
             'rfind(s, sub): int',
             'isAlphaAscii(s): bool',
             'isDigit(s): bool',
             'isSpace(s): bool',
             'format(fmt, args): string — % operator',
             'multiReplace(s, replacements): string'] },

  { name:'std/sequtils', desc:'Sequence and iterable utilities',
    members:['map(s, f): seq',
             'filter(s, pred): seq',
             'keepIf(s: var seq, pred)',
             'foldl(s, op): T',
             'foldr(s, op): T',
             'any(s, pred): bool',
             'all(s, pred): bool',
             'count(s, item): int',
             'zip(a, b): seq[tuple]',
             'unzip(s): (seq, seq)',
             'flatten(s): seq',
             'deduplicate(s): seq',
             'distribute(s, num): seq[seq]',
             'cycle(s, times): seq',
             'repeat(item, count): seq',
             'concat(seqs): seq',
             'insert(s: var seq, item, i)',
             'toSeq(iter): seq',
             'mapIt(s, expr): seq — macro',
             'filterIt(s, cond): seq — macro',
             'anyIt(s, cond): bool — macro',
             'allIt(s, cond): bool — macro',
             'countIt(s, cond): int — macro'] },

  { name:'std/tables',   desc:'Hash tables',
    members:['initTable[K, V](): Table[K, V]',
             'initOrderedTable[K, V](): OrderedTable[K, V]',
             'initCountTable[K](): CountTable[K]',
             'toTable(pairs): Table',
             'toOrderedTable(pairs): OrderedTable',
             't[key]: V — index access',
             't.getOrDefault(key, default): V',
             't.hasKey(key): bool',
             't.contains(key): bool',
             't.del(key)',
             't.pop(key, val: var V): bool',
             't.len: int',
             't.pairs(): (K, V) iterator',
             't.keys(): K iterator',
             't.values(): V iterator',
             't.mvalues(): var V iterator',
             't.merge(t2)',
             'CountTable.inc(key)',
             'CountTable.largest(): (K, int)'] },

  { name:'std/os',       desc:'Operating system interface',
    members:['getCurrentDir(): string',
             'setCurrentDir(path)',
             'getHomeDir(): string',
             'getTempDir(): string',
             'getAppDir(): string',
             'getEnv(key, default): string',
             'existsEnv(key): bool',
             'putEnv(key, val)',
             'commandLineParams(): seq[string]',
             'getAppFilename(): string',
             'fileExists(path): bool',
             'dirExists(path): bool',
             'createDir(path)',
             'createDirs(path)',
             'removeDir(path)',
             'removeFile(path)',
             'copyFile(src, dest)',
             'moveFile(src, dest)',
             'copyDir(src, dest)',
             'renameFile(old, new)',
             'walkFiles(pattern): iterator',
             'walkDir(path): iterator',
             'walkDirRec(path): iterator',
             'splitPath(path): tuple',
             'joinPath(parts): string',
             'expandFilename(path): string',
             'normalizedPath(path): string',
             'isAbsolute(path): bool',
             'relativePath(path, base): string',
             'sleep(milsecs: int)',
             'quoteShell(s): string',
             'DirSep: char',
             'PathSep: char'] },

  { name:'std/json',     desc:'JSON parsing and serialization',
    members:['parseJson(s): JsonNode',
             'to[T](node): T — deserialize to type',
             '% value: JsonNode — construct JSON',
             '%* expr: JsonNode — construct from literal',
             'JsonNode.kind: JNodeKind',
             'JsonNode.str: string',
             'JsonNode.num: float',
             'JsonNode.getBool: bool',
             'JsonNode.getInt: int',
             'JsonNode.getFloat: float',
             'JsonNode.getStr: string',
             'JsonNode.hasKey(key): bool',
             'JsonNode[key]: JsonNode',
             'JsonNode.getOrDefault(key): JsonNode',
             'JsonNode.len: int',
             'JsonNode.add(item)',
             'JsonNode.delete(key)',
             'JsonNode.pairs(): iterator',
             'JsonNode.elems: seq[JsonNode]',
             'pretty(node, indent): string',
             '$node: string',
             'newJNull(): JsonNode',
             'newJBool(b): JsonNode',
             'newJInt(n): JsonNode',
             'newJFloat(f): JsonNode',
             'newJString(s): JsonNode',
             'newJArray(): JsonNode',
             'newJObject(): JsonNode'] },

  { name:'std/asyncdispatch', desc:'Async/await and event loop',
    members:['async pragma — marks proc as async',
             'await expr — wait for Future',
             'waitFor(future) — block until done',
             'newAsyncSocket(): AsyncSocket',
             'newAsyncHttpServer(): AsyncHttpServer',
             'poll(timeout) — run event loop once',
             'runForever() — run event loop',
             'sleepAsync(ms): Future[void]',
             'Future[T] — result of async proc',
             'newFuture[T](name): Future[T]',
             'future.complete(val)',
             'future.fail(error)',
             'future.read(): T',
             'future.finished: bool',
             'future.failed: bool',
             'all(futures): Future[seq[T]]',
             'race(futures): Future[T]',
             'withTimeout(future, ms): Future[bool]',
             'callSoon(cb)',
             'addTimer(ms, oneshot, cb)'] },

  { name:'std/httpclient', desc:'HTTP client',
    members:['newHttpClient(): HttpClient',
             'newAsyncHttpClient(): AsyncHttpClient',
             'client.get(url): Response',
             'client.post(url, body): Response',
             'client.request(url, httpMethod, body): Response',
             'client.headers: HttpHeaders',
             'client.timeout: int',
             'client.close()',
             'Response.status: string',
             'Response.code: HttpCode',
             'Response.body: string',
             'Response.headers: HttpHeaders',
             'newHttpHeaders(pairs): HttpHeaders',
             'Http200, Http404, Http500 — status codes'] },

  { name:'std/re',       desc:'Regular expressions',
    members:['re(pattern): Regex — compile pattern',
             'match(s, pattern): bool',
             'match(s, regex, m: var RegexMatch): bool',
             'find(s, regex, start): int',
             'findAll(s, regex): seq[string]',
             'findBounds(s, regex): Slice[int]',
             'replace(s, regex, by): string',
             'replacef(s, regex, by): string',
             'split(s, regex): seq[string]',
             'captures(m): seq[string]',
             'captureBounds(m): seq[Slice]',
             'groupCount(regex): int'] },

  { name:'std/math',     desc:'Mathematical functions and constants',
    members:['PI: float64',
             'E: float64',
             'sqrt(x): float',
             'cbrt(x): float',
             'pow(x, y): float',
             'exp(x): float',
             'ln(x): float',
             'log2(x): float',
             'log10(x): float',
             'sin(x): float',
             'cos(x): float',
             'tan(x): float',
             'arcsin(x): float',
             'arccos(x): float',
             'arctan(x): float',
             'arctan2(y, x): float',
             'hypot(x, y): float',
             'ceil(x): float',
             'floor(x): float',
             'round(x): float',
             'trunc(x): float',
             'abs(x): float',
             'sgn(x): int',
             'isNaN(x): bool',
             'isInf(x): bool',
             'floorDiv(x, y): int',
             'floorMod(x, y): int',
             'gcd(x, y): int',
             'lcm(x, y): int',
             'clamp(x, lo, hi): T',
             'nextPowerOfTwo(x): int'] },

  { name:'std/options',  desc:'Optional values',
    members:['some(val): Option[T] — wrap a value',
             'none(T): Option[T] — empty option',
             'isSome(opt): bool',
             'isNone(opt): bool',
             'get(opt): T — raises if none',
             'get(opt, default): T',
             'unsafeGet(opt): T',
             'map(opt, f): Option',
             'flatMap(opt, f): Option',
             'filter(opt, pred): Option',
             'Option.get() — raise Defect if none',
             'when opt.isSome: opt.get()'] },

  { name:'std/strformat', desc:'String interpolation',
    members:['fmt"..." — interpolate with {}',
             'fmt"{x}" — insert variable',
             'fmt"{x:.2f}" — float with 2 decimals',
             'fmt"{x:>10}" — right-align width 10',
             'fmt"{x:<10}" — left-align width 10',
             'fmt"{x:0>5}" — zero-pad',
             'fmt"{x:#b}" — binary',
             'fmt"{x:#o}" — octal',
             'fmt"{x:#x}" — hex',
             '&"..." — same as fmt but explicit'] },

  { name:'std/times',    desc:'Date and time',
    members:['now(): DateTime',
             'getTime(): Time',
             'cpuTime(): float — seconds since start',
             'epochTime(): float — Unix timestamp',
             'DateTime.year, month, day, hour, minute, second',
             'initDateTime(day, month, year, ...): DateTime',
             'parse(s, fmt): DateTime',
             'format(dt, fmt): string',
             'toTime(dt): Time',
             'toUnix(t): int64',
             'fromUnix(i): Time',
             'Duration — nanoseconds type',
             'initDuration(seconds, milliseconds, ...): Duration',
             'inSeconds(d): int64',
             'inMilliseconds(d): int64',
             'dt + duration: DateTime',
             'dt - dt2: Duration',
             'getClockStr(): string',
             'getDateStr(): string'] },

  { name:'std/random',   desc:'Random number generation',
    members:['randomize() — seed from time',
             'randomize(seed)',
             'rand(max): int — 0..max-1',
             'rand(range): T — from range',
             'rand(f: float): float — 0.0..f',
             'sample(s: seq): T',
             'shuffle(s: var seq)',
             'initRand(seed): Rand',
             'Rand.rand(max): int',
             'Rand.sample(s): T',
             'Rand.shuffle(s: var seq)'] },

  { name:'std/algorithm', desc:'Sorting and searching',
    members:['sort(s: var seq)',
             'sort(s: var seq, cmp)',
             'sorted(s: seq): seq',
             'sortedByIt(s, expr): seq — macro',
             'reverse(s: var seq)',
             'reversed(s: seq): seq',
             'binarySearch(s, key): int',
             'lowerBound(s, key): int',
             'upperBound(s, key): int',
             'nextPermutation(s: var seq): bool',
             'prevPermutation(s: var seq): bool',
             'isSorted(s): bool',
             'Ascending, Descending — order enum'] },

  { name:'std/sets',     desc:'Hash sets',
    members:['toHashSet(items): HashSet[T]',
             'initHashSet[T](): HashSet[T]',
             'initOrderedSet[T](): OrderedSet[T]',
             'incl(s: var HashSet, item)',
             'excl(s: var HashSet, item)',
             'contains(s, item): bool',
             'card(s): int — cardinality',
             'union(a, b): HashSet',
             'intersection(a, b): HashSet',
             'difference(a, b): HashSet',
             'symmetricDifference(a, b): HashSet',
             'isSubset(a, b): bool',
             'items(s): iterator'] },

  { name:'std/macros',   desc:'Macro development API',
    members:['NimNode — AST node type',
             'newTree(kind, children): NimNode',
             'newLit(val): NimNode — literal node',
             'newIdentNode(name): NimNode',
             'newStrLitNode(s): NimNode',
             'newIntLitNode(i): NimNode',
             'newEmptyNode(): NimNode',
             'newStmtList(nodes): NimNode',
             'newCall(name, args): NimNode',
             'newProc(name, params, body): NimNode',
             'newNimNode(kind): NimNode',
             'quote do: block — hygienic quoting',
             'getAst(call): NimNode',
             'parseExpr(s): NimNode',
             'parseStmt(s): NimNode',
             'repr(node): string — node to code',
             'treeRepr(node): string — debug view',
             'lispRepr(node): string',
             'node.kind: NimNodeKind',
             'node.len: int',
             'node[i]: NimNode',
             'node.add(child)',
             'node.strVal: string',
             'node.intVal: BiggestInt',
             'node.floatVal: BiggestFloat',
             'node.symbol: NimSym',
             'nnkIdent, nnkStrLit, nnkIntLit, etc — node kinds',
             'bindSym("name"): NimNode',
             'genSym(kind, name): NimNode — unique ident',
             'copyNimNode(n): NimNode',
             'copyNimTree(n): NimNode',
             'expectKind(n, kind)',
             'expectLen(n, len)',
             'error(msg, n) — compile error',
             'warning(msg, n)',
             'hint(msg, n)'] },

  { name:'std/typetraits', desc:'Compile-time type inspection',
    members:['name(T): string — type name as string',
             'genericParams(T): typedesc — get generic params',
             'isNamedTuple(T): bool',
             'distinctBase(T): typedesc',
             'tupleLen(T): int',
             'get(T, i): typedesc — tuple element type',
             'elementType(T): typedesc — seq/array element',
             'supportsCopyMem(T): bool',
             'isRef(T): bool',
             'isPtr(T): bool',
             'isProc(T): bool',
             'compiles(expr): bool — CT check'] },
]

function buildDocsPanel() {
  const wrap = mk('div', 'sb-panel-inner')
  const hdr = mk('div', 'sb-hdr')
  hdr.innerHTML = `<span class="sb-title">NIM STDLIB</span>`
  wrap.appendChild(hdr)

  const searchRow = mk('div', 'docs-search-row')
  const inp = mk('input', 'docs-search')
  inp.type = 'text'
  inp.placeholder = 'Search stdlib…'
  inp.autocomplete = 'off'
  searchRow.appendChild(inp)
  wrap.appendChild(searchRow)

  const list = mk('div', 'docs-list')
  list.id = 'docs-list'

  function renderDocs(query) {
    list.innerHTML = ''
    const q = query.toLowerCase()
    const filtered = q
      ? STD_DOCS.filter(m => m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.members.some(mb => mb.toLowerCase().includes(q)))
      : STD_DOCS
    filtered.forEach(mod => {
      const modEl = mk('div', 'docs-module')
      const modHdr = mk('div', 'docs-mod-hdr')
      modHdr.innerHTML = `<span class="docs-mod-name">${escH(mod.name)}</span><span class="docs-mod-desc">${escH(mod.desc)}</span>`
      modHdr.addEventListener('click', () => {
        const body = modEl.querySelector('.docs-mod-body')
        body.classList.toggle('hidden')
        modHdr.classList.toggle('open')
      })
      const body = mk('div', 'docs-mod-body' + (q ? '' : ' hidden'))
      const filteredMembers = q
        ? mod.members.filter(m => m.toLowerCase().includes(q))
        : mod.members
      filteredMembers.forEach(member => {
        const row = mk('div', 'docs-member')
        const parts = member.split(' — ')
        const sig = parts[0].trim()
        const note = parts[1] || ''
        row.innerHTML = `<span class="docs-sig">${escH(sig)}</span>${note ? `<span class="docs-note">${escH(note)}</span>` : ''}`
        // Click to insert at cursor
        row.title = 'Click to insert: ' + mod.name + '.' + sig.split('(')[0]
        row.addEventListener('click', () => {
          const ta = document.getElementById('editor-ta')
          if (!ta) return
          const { selectionStart: s, selectionEnd: e, value: v } = ta
          const insert = mod.name + '.' + sig.split('(')[0].split(':')[0].trim()
          ta.value = v.slice(0, s) + insert + v.slice(e)
          ta.selectionStart = ta.selectionEnd = s + insert.length
          ta.dispatchEvent(new Event('input'))
          ta.focus()
        })
        body.appendChild(row)
      })
      modEl.append(modHdr, body)
      list.appendChild(modEl)
    })
    if (!filtered.length) {
      list.innerHTML = '<div class="docs-empty">No matches for "' + escH(q) + '"</div>'
    }
  }

  renderDocs('')
  inp.addEventListener('input', () => renderDocs(inp.value))
  wrap.appendChild(list)
  return wrap
}

// ── Minimap ──────────────────────────────────────────────────────────────────
function buildMinimap() {
  const mm = mk('div', 'minimap')
  mm.id = 'minimap'
  if (!PREFS.minimap) mm.style.display = 'none'
  const canvas = document.createElement('canvas')
  canvas.id = 'minimap-canvas'
  canvas.width = 120
  mm.appendChild(canvas)
  // Viewport indicator
  const vp = mk('div', 'minimap-vp')
  vp.id = 'minimap-vp'
  mm.appendChild(vp)
  // Click to scroll
  mm.addEventListener('click', e => {
    const pane = document.getElementById('code-pane')
    if (!pane) return
    const rect = mm.getBoundingClientRect()
    const frac = (e.clientY - rect.top) / rect.height
    pane.scrollTop = frac * pane.scrollHeight
  })
  return mm
}

let _mmRaf = 0
function updateMinimap() {
  if (!PREFS.minimap) return
  cancelAnimationFrame(_mmRaf)
  _mmRaf = requestAnimationFrame(() => {
    const canvas = document.getElementById('minimap-canvas')
    const mm = document.getElementById('minimap')
    const ta2 = document.getElementById('editor-ta')
    const tab = activeTab()
    if (!canvas || !mm || !ta2 || !tab) return
    const pane = ta2

    const mmH = mm.clientHeight || 400
    canvas.height = mmH
    canvas.width  = 120
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 120, mmH)

    const lines = tab.content.split('\n')
    const totalLines = lines.length
    const lineH = Math.max(1, mmH / totalLines)
    const isDark = PREFS.theme !== 'light'

    lines.forEach((line, i) => {
      const y = i * lineH
      const trimmed = line.trim()
      // Color by content type
      let color = isDark ? 'rgba(144,144,176,.35)' : 'rgba(80,80,100,.3)'
      if (/^\s*\/\//.test(line)) color = isDark ? 'rgba(68,68,90,.7)' : 'rgba(130,130,150,.5)'
      else if (/^\s*(pub fn|fn )\b/.test(line)) color = isDark ? 'rgba(192,132,252,.7)' : 'rgba(100,60,180,.7)'
      else if (/^\s*(const|var)\b/.test(line)) color = isDark ? 'rgba(96,165,250,.5)' : 'rgba(37,99,235,.5)'
      else if (/^\s*(if|for|while|switch)\b/.test(line)) color = isDark ? 'rgba(249,115,22,.5)' : 'rgba(200,80,0,.5)'
      else if (/"/.test(line)) color = isDark ? 'rgba(251,191,36,.4)' : 'rgba(180,120,0,.5)'

      const len = Math.min(trimmed.length * 0.8, 115)
      const indent = (line.length - trimmed.length) * 0.8
      ctx.fillStyle = color
      ctx.fillRect(indent, y, len, Math.max(1, lineH * 0.7))
    })

    // Viewport box
    const vp = document.getElementById('minimap-vp')
    if (vp && pane.scrollHeight > pane.clientHeight) {
      const frac = pane.scrollTop / pane.scrollHeight
      const vpH  = (pane.clientHeight / pane.scrollHeight) * mmH
      vp.style.top    = (frac * mmH) + 'px'
      vp.style.height = vpH + 'px'
    }
  })
}

// ── Multi-cursor (true Ctrl+D) ───────────────────────────────────────────────
// We store extra cursor positions and render them as overlays
const MC = { cursors: [], active: false }

function mcAddNextMatch(ta) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta
  const word = v.slice(s, e)
  if (!word || word.includes('\n')) return false

  // Find next occurrence after current selection
  const start = MC.cursors.length > 0
    ? MC.cursors[MC.cursors.length - 1].end
    : e
  const next = v.indexOf(word, start)
  if (next === -1 || next === s) return false // wrapped or same

  MC.cursors.push({ start: next, end: next + word.length })
  MC.active = true
  renderMultiCursors(ta)
  return true
}

function renderMultiCursors(ta) {
  // Remove old overlays
  document.querySelectorAll('.mc-highlight').forEach(el => el.remove())

  const hl = document.getElementById('hl')
  const pane = document.getElementById('code-pane')
  if (!hl || !pane || !MC.active) return

  const v = ta.value
  MC.cursors.forEach(({ start, end }) => {
    const before = v.slice(0, start)
    const lineNo  = (before.match(/\n/g) || []).length
    const col     = before.length - before.lastIndexOf('\n') - 1
    const lineH   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lh')) || 22
    const charW   = PREFS.fontSize * 0.615

    const highlight = mk('div', 'mc-highlight')
    highlight.style.cssText =
      'position:absolute;' +
      'top:' + (12 + lineNo * lineH) + 'px;' +
      'left:' + (16 + col * charW) + 'px;' +
      'width:' + ((end - start) * charW) + 'px;' +
      'height:' + lineH + 'px;' +
      'background:rgba(249,115,22,.25);' +
      'pointer-events:none;z-index:4;'
    document.getElementById('code-pane')?.appendChild(highlight)
  })
}

function mcClear() {
  MC.cursors = []; MC.active = false
  document.querySelectorAll('.mc-highlight').forEach(el => el.remove())
}

function mcApplyToAll(ta, fn) {
  // Apply an edit function at each extra cursor position
  if (!MC.active || !MC.cursors.length) return
  let v = ta.value
  let offset = 0
  // Sort cursors by position
  const sorted = [...MC.cursors].sort((a, b) => a.start - b.start)
  sorted.forEach(({ start, end }) => {
    const adjStart = start + offset
    const adjEnd   = end   + offset
    const result   = fn(v, adjStart, adjEnd)
    offset += result.inserted.length - (adjEnd - adjStart)
    v = result.newValue
  })
  ta.value = v
  ta.dispatchEvent(new Event('input'))
  mcClear()
}

// ── Font zoom ────────────────────────────────────────────────────────────────
function zoomFont(delta) {
  PREFS.fontSize = Math.max(10, Math.min(24, PREFS.fontSize + delta))
  savePrefs(); applyPrefs()
  const tab = activeTab()
  if (tab) setTimeout(() => resizeTextarea(tab), 60)
  tLine('Font size: ' + PREFS.fontSize + 'px', '#60a5fa')
}

// ── Memory leak detector ─────────────────────────────────────────────────────
// Parses GPA/valgrind leak output from nim run/test and adds to Problems panel
function parseLeaks(output) {
  const leaks = []
  // Pattern: "leak at address 0x..., allocated here:"
  // or GPA output: "N bytes of memory were not freed"
  const bytePattern = /(\d+) bytes? of memory (?:was|were) not freed/
  const leakPattern = /memory address 0x[0-9a-f]+ leaked/i
  const tracePattern = /^\s*.*?:(\d+):(\d+):\s*(.*)/

  const lines = output.split('\n')
  let inLeak = false
  lines.forEach((line, i) => {
    if (bytePattern.test(line) || leakPattern.test(line)) {
      inLeak = true
    }
    if (inLeak) {
      const m = line.match(/([^:]+\.nim):(\d+):(\d+)/)
      if (m) {
        leaks.push({
          file:    m[1],
          line:    parseInt(m[2]),
          col:     parseInt(m[3]),
          kind:    'warning',
          message: 'Memory leak detected here',
          source:  'GPA',
        })
        inLeak = false
      }
    }
  })
  return leaks
}


// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  S.tabs.push({ id:'demo', path:null, name:'main.nim', content:DEMO, dirty:false, lang:'nim' })
  S.activeTab = 'demo'
  buildApp()
  wireAll()
  tPrint('\x1b[33m  Ferrum Studio\x1b[0m\x1b[2m — The Nim IDE\x1b[0m\n')
  tPrint('\x1b[2m  F5=Run  F6=Run+args  F7=Build  F8=Test  Ctrl+S=Save+Check  Ctrl+P=Quick Open\x1b[0m\n\n')
  // Async init
  go('GetNimInfo').then(info => {
    if (!info) return
    S.nimInfo = info
    updateNimBadge(info)
  })
  go('GetBuildSteps').then(steps => { if(steps) S.buildSteps = steps; renderBuildPanel() })
  // Restore font size from last session
  if (_fontSize !== 13) applyFontSize(_fontSize)
  go('GetGitStatus').then(gs => { if(gs) { S.gitStatus=gs; updateGitUI() } })
}

// ── Build entire app ──────────────────────────────────────────────────────────
function buildApp() {
  const app = document.getElementById('app')
  app.innerHTML = ''
  const ide = mk('div','ide'); ide.id='ide'
  const tplDlg = buildTemplateDialog()
  ide.append(
    buildTitlebar(),
    buildMainArea(),
    buildStatusBar(),
    buildArgsDialog(),
    buildNewItemDialog(),
    buildScaffoldDialog(),
    tplDlg,
  )
  app.appendChild(ide)
  applyPrefs()
}

// ── Titlebar ──────────────────────────────────────────────────────────────────
function buildTitlebar() {
  const bar = mk('div','titlebar')

  const logo = mk('div','logo')
  logo.innerHTML = `
    <img src="./logo.png" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" style="height:22px;display:block">
    <svg style="display:none" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7z" fill="#f97316" opacity=".9"/>
      <path d="M12 2v20M3 7l9 5 9-5" stroke="rgba(255,255,255,.15)" stroke-width=".9"/>
    </svg>
    <span class="logo-txt">Ferrum Studio</span>`

  const menu = mk('div','tb-menu')
  ;[['File','m:file'],['Edit','m:edit'],['Run','m:run'],['Nim','m:nim'],['View','m:view']].forEach(([l,a])=>{
    const b = mkt('button','menu-btn',l); b.dataset.a=a; menu.appendChild(b)
  })

  const acts = mk('div','tb-acts')
  acts.innerHTML = `
    <button class="tbtn run-btn" data-a="z:run"      title="Run (F5)">Run</button>
    <button class="tbtn"         data-a="z:run-args"  title="Run with args (F6)">Run...</button>
    <button class="tbtn"         data-a="z:build"     title="nimble build (F7)">Build</button>
    <button class="tbtn"         data-a="z:test"      title="nimble test (F8)">Test</button>
    <button class="tbtn"         data-a="z:fmt"       title="Format (Ctrl+Shift+F)">Fmt</button>
    <button class="tbtn"         data-a="z:check"     title="Check (Ctrl+Shift+C)">Check</button>
    <button class="tbtn kill-btn hidden" id="kill-btn" data-a="z:kill">Stop</button>`

  const info = mk('div','tb-info')
  info.innerHTML = `
    <span id="nim-badge" style="cursor:pointer" title="Nim version">nim ${S.nimInfo.version}</span>
    <span id="plat-badge">${S.nimInfo.os}</span>`

  bar.append(logo, menu, acts, info)
  return bar
}

// ── Main area ─────────────────────────────────────────────────────────────────
function buildMainArea() {
  const main = mk('div','main-area')
  const rv = mk('div','resize-v'); rv.dataset.drag='sb'
  const col = mk('div','editor-col')
  col.append(buildTabBar(), buildBreadcrumb(), buildEditorArea(), buildResizeH(), buildBottomPanel())
  main.append(buildSidebar(), rv, col)
  return main
}

function buildBreadcrumb() {
  const bar = mk('div','breadcrumb'); bar.id='breadcrumb'
  updateBreadcrumb(bar)
  return bar
}

function updateBreadcrumb(bar) {
  bar = bar || document.getElementById('breadcrumb')
  if (!bar) return
  const tab = activeTab()
  if (!tab || !tab.path) {
    bar.innerHTML = '<span class="bc-item bc-dim">Ferrum Studio</span>'
    return
  }
  const parts = tab.path.replace(/\\/g, '/').split('/')
  bar.innerHTML = parts.map((part, i) => {
    const isLast = i === parts.length - 1
    const sep = i > 0 ? '<span class="bc-sep">›</span>' : ''
    return sep + '<span class="bc-item' + (isLast ? ' bc-active' : '') + '">' + escH(part) + '</span>'
  }).join('')
}

// ── Sidebar with activity bar ─────────────────────────────────────────────────
function buildSidebar() {
  const sb = mk('div','sidebar'); sb.id='sidebar'; sb.style.width = S.sbW+'px'

  // Activity bar
  const act = mk('div','activity-bar')
  act.innerHTML = `
    <button class="act-btn active" data-pnl="explorer" title="Explorer (files)">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 2h5l2 2h5v12H3V2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <line x1="6" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="act-btn" data-pnl="build" title="Build targets">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="act-btn" data-pnl="snippets" title="Snippets &amp; reference">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <line x1="3" y1="5"  x2="15" y2="5"  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="3" y1="9"  x2="12" y2="9"  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="3" y1="13" x2="9"  y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <circle cx="14" cy="13" r="2.5" stroke="currentColor" stroke-width="1.2"/>
        <line x1="13" y1="13" x2="15" y2="13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="14" y1="12" x2="14" y2="14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="act-btn" data-pnl="docs" title="Zig Docs Browser">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3"/>
        <line x1="5" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="act-btn" data-pnl="settings" title="Settings">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>`

  act.addEventListener('click', e => {
    const btn = e.target.closest('.act-btn')
    if (!btn) return
    const pnl = btn.dataset.pnl
    act.querySelectorAll('.act-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    $$('.sb-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'pnl-'+pnl))
  })

  const content = mk('div','sb-content')

  // Explorer panel
  const explorer = mk('div','sb-panel'); explorer.id='pnl-explorer'
  const eh = mk('div','sb-hdr')
  eh.innerHTML='<span class="sb-title">EXPLORER</span>'
  const openBtn = mk('button','icon-btn'); openBtn.title='Open folder'; openBtn.dataset.a='open:folder'
  openBtn.innerHTML=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h4l2 2.5H13v6.5H1V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`
  eh.appendChild(openBtn)
  explorer.append(eh, buildTreeView())

  // Build panel
  const buildPanel = mk('div','sb-panel hidden'); buildPanel.id='pnl-build'
  buildPanel.appendChild(buildBuildPanel())

  // Snippets panel
  const snipPanel = mk('div','sb-panel hidden'); snipPanel.id='pnl-snippets'
  snipPanel.appendChild(buildSnippetsPanel())

  const docsPanel = mk('div','sb-panel hidden'); docsPanel.id='pnl-docs'
  docsPanel.appendChild(buildDocsPanel())
  const settingsPanel = mk('div','sb-panel hidden'); settingsPanel.id='pnl-settings'
  settingsPanel.appendChild(buildSettingsPanel())
  content.append(explorer, buildPanel, snipPanel, docsPanel, settingsPanel)
  sb.append(act, content)
  return sb
}

function buildTreeView() {
  const wrap = mk('div','tree-scroll'); wrap.id='tree-scroll'
  if (!S.tree) {
    const empty = mk('div','tree-empty')
    empty.innerHTML = `
      <div class="empty-icon">[+]</div>
      <div class="empty-label">No folder open</div>
      <button class="wbtn primary small" data-a="open:folder">Open Folder</button>
      <button class="wbtn small" data-a="scaffold:open">New Project</button>`
    wrap.appendChild(empty)
  } else {
    renderTreeNode(wrap, S.tree, 0)
  }
  return wrap
}

function renderTreeNode(parent, node, depth) {
  const pad = depth*14+8
  if (node.isDir) {
    const open = S.expanded.has(node.path)
    const row = mk('div', open ? 'tree-row dir open' : 'tree-row dir')
    row.style.paddingLeft = pad+'px'
    row.dataset.a = 'tree:dir'; row.dataset.path = node.path
    const gitMark = getGitMark(node.name)
    row.innerHTML = `<span class="caret">${open?'v':'>'}</span><span class="tree-ico">${open?'[dir]':'[dir]'}</span><span class="tree-lbl">${escH(node.name)}</span>${gitMark}`
    row.addEventListener('contextmenu', e => { e.preventDefault(); showTreeCtx(e, node) })
    parent.appendChild(row)
    if (open && node.children) node.children.forEach(c => renderTreeNode(parent, c, depth+1))
  } else {
    const diags = S.diagsByFile[node.path] || []
    const errs = diags.filter(d=>d.kind==='error').length
    const warns = diags.filter(d=>d.kind==='warning').length
    const row = mk('div','tree-row file')
    row.style.paddingLeft = (pad+14)+'px'
    row.dataset.a='tree:file'; row.dataset.path=node.path; row.dataset.name=node.name
    const [ic,il] = fileIcon(node.name)
    const badge = errs ? `<span class="tree-badge err">${errs}</span>` : warns ? `<span class="tree-badge warn">${warns}</span>` : ''
    const gitMark = getGitMark(node.name)
    row.innerHTML = `<span class="ficon ${ic}">${il}</span><span class="tree-lbl">${escH(node.name)}</span>${badge}${gitMark}`
    row.addEventListener('contextmenu', e => { e.preventDefault(); showTreeCtx(e, node) })
    parent.appendChild(row)
  }
}

function getGitMark(name) {
  const gs = S.gitStatus
  if (!gs.hasGit) return ''
  const m = gs.modified.some(f => f.endsWith(name)) ? 'M' :
            gs.added.some(f => f.endsWith(name)) ? 'A' :
            gs.untracked.some(f => f.endsWith(name)) ? '?' : ''
  if (!m) return ''
  const cls = m==='M'?'git-m':m==='A'?'git-a':'git-u'
  return `<span class="${cls} git-mark">${m}</span>`
}

function fileIcon(name) {
  const e = extOf(name)
  return {
    nim:['ico-nim','n'], md:['ico-md','m'], json:['ico-js','{}'],
    zon:['ico-js','{}'], toml:['ico-t','t'], yaml:['ico-t','y'],
    js:['ico-js','js'], ts:['ico-js','ts'], c:['ico-c','c'],
    h:['ico-c','h'], cpp:['ico-c','c+'], py:['ico-py','py'],
    sh:['ico-sh','sh'], txt:['ico-txt','·'], rs:['ico-rs','rs'],
  }[e] || ['ico-gen','·']
}

// ── Build panel ───────────────────────────────────────────────────────────────
function buildBuildPanel() {
  const wrap = mk('div','ref-panel')
  const hdr = mk('div','sb-hdr')
  hdr.appendChild(mkt('span','sb-title','BUILD TARGETS'))
  const refreshBtn = mk('button','icon-btn'); refreshBtn.title='Refresh'; refreshBtn.dataset.a='build:refresh'
  refreshBtn.textContent='R'; hdr.appendChild(refreshBtn)
  wrap.appendChild(hdr)

  const list = mk('div','build-list'); list.id='build-list'

  const noBuild = !S.tree
  if (noBuild) {
    list.innerHTML = '<div class="ref-empty">Open a project folder with a .nimble file</div>'
  } else if (!S.buildSteps.length) {
    list.innerHTML = '<div class="ref-empty">No build steps found</div>'
  } else {
    S.buildSteps.forEach(step => {
      const row = mk('div','build-step-row')
      row.dataset.a = 'build:step'; row.dataset.name = step.name
      const iconMap = { test:'+', run:'>', install:'v', clean:'x', build:'*' }
      const icon = iconMap[step.kind] || '*'
      row.innerHTML = `
        <span class="build-step-icon ${step.kind}">${icon}</span>
        <div class="build-step-info">
          <span class="build-step-name">${escH(step.name)}</span>
          <span class="build-step-desc">${escH(step.desc)}</span>
        </div>
        <button class="build-step-run" data-a="build:step" data-name="${escH(step.name)}" title="Run this step">></button>`
      list.appendChild(row)
    })
  }

  // New project button
  const foot = mk('div','build-footer')
  const scaffoldBtn = mkt('button','wbtn small','New Nim Project')
  scaffoldBtn.dataset.a = 'scaffold:open'
  foot.appendChild(scaffoldBtn)
  wrap.append(list, foot)
  return wrap
}

function renderBuildPanel() {
  const list = $('#build-list'); if (!list) return
  const panel = document.getElementById('pnl-build')
  if (panel) { panel.innerHTML=''; panel.appendChild(buildBuildPanel()) }
}

// ── Snippets panel ────────────────────────────────────────────────────────────
function buildSnippetsPanel() {
  const wrap = mk('div','ref-panel')
  const hdr = mk('div','sb-hdr')
  hdr.appendChild(mkt('span','sb-title','SNIPPETS & REFERENCE'))
  wrap.appendChild(hdr)

  const body = mk('div','ref-body')

  // Snippets
  const sHdr = mk('div','ref-sect-hdr')
  sHdr.textContent = '> Snippets  (type + Tab)'
  sHdr.dataset.a = 'ref:toggle'; sHdr.dataset.sect = 'snips'
  const sList = mk('div','ref-sect-body hidden'); sList.id = 'sect-snips'
  SNIPPETS.forEach(([trigger,display,]) => {
    const row = mk('div','snip-row')
    row.innerHTML = `<span class="snip-key">${escH(trigger)}</span><span class="snip-disp">${escH(display)}</span>`
    row.dataset.snip = trigger
    row.dataset.a = 'snip:insert'
    sList.appendChild(row)
  })
  body.append(sHdr, sList)

  // Std reference
  const STD = [
    ['system',          'echo, len, add, del, new, quit, assert, high, low'],
    ['std/strutils',    'split, strip, replace, toLower, startsWith, parseInt'],
    ['std/sequtils',    'map, filter, foldl, any, all, zip, toSeq, mapIt'],
    ['std/tables',      'initTable, hasKey, getOrDefault, pairs, keys'],
    ['std/os',          'getCurrentDir, fileExists, walkDir, getEnv, sleep'],
    ['std/json',        'parseJson, to[T], %*, pretty, JsonNode'],
    ['std/strformat',   'fmt"..." interpolation, &"..." operator'],
    ['std/times',       'now, cpuTime, epochTime, format, parse, Duration'],
    ['std/math',        'sqrt, pow, sin, cos, floor, ceil, round, PI'],
    ['std/random',      'randomize, rand, sample, shuffle, initRand'],
    ['std/options',     'some, none, isSome, isNone, get, map, filter'],
    ['std/algorithm',   'sort, sorted, binarySearch, reverse, isSorted'],
    ['std/re',          're, match, findAll, replace, split, captures'],
    ['std/asyncdispatch','async, await, waitFor, sleepAsync, poll'],
    ['std/httpclient',  'newHttpClient, get, post, request, Response'],
    ['std/sets',        'toHashSet, incl, excl, contains, union, intersection'],
    ['std/macros',      'NimNode, newTree, quote do, repr, treeRepr'],
  ]
  const rHdr = mk('div','ref-sect-hdr')
  rHdr.textContent = '> Nim stdlib'
  rHdr.dataset.a='ref:toggle'; rHdr.dataset.sect='std'
  const rList = mk('div','ref-sect-body hidden'); rList.id='sect-std'
  STD.forEach(([mod, desc]) => {
    const row = mk('div','ref-row')
    row.innerHTML = `<div class="ref-mod">${escH(mod)}</div><div class="ref-desc">${escH(desc)}</div>`
    row.addEventListener('click', () => insertAtCursor('@import("std").\n'))
    rList.appendChild(row)
  })
  body.append(rHdr, rList)

  // Zig patterns
  const PATS = [
    ['Option[T]',       'Optional value — use isSome/get or case'],
    ['ref T',           'Heap-allocated reference type'],
    ['ptr T',           'Unsafe pointer — manual memory'],
    ['seq[T]',          'Dynamic array — @[], add, del, len'],
    ['array[N, T]',     'Fixed-size stack array'],
    ['openArray[T]',    'Untyped slice — accepts seq or array'],
    ['varargs[T]',      'Variable number of args like printf'],
    ['tuple[a: T, ...]','Named or anonymous tuple'],
    ['defer: stmt',     'Runs at end of scope (like Go defer)'],
    ['when cond:',      'Compile-time conditional (like #ifdef)'],
    ['template',        'Inline code reuse — no overhead'],
    ['macro',           'AST transformation at compile time'],
    ['iterator',        'Lazy sequence generator with yield'],
    ['converter',       'Implicit type conversion'],
    ['concept',         'Generic constraint (like Rust traits)'],
    ['distinct T',      'New type based on T — no implicit conv'],
    ['object variants', 'Discriminated union (case field)'],
    ['{.pragma.}',      'Annotate proc/type — raises, inline, etc'],
    ['cast[T](x)',      'Bit-level reinterpret — unsafe'],
  ]
  const pHdr = mk('div','ref-sect-hdr')
  pHdr.textContent = '> Nim patterns'
  pHdr.dataset.a='ref:toggle'; pHdr.dataset.sect='pats'
  const pList = mk('div','ref-sect-body hidden'); pList.id='sect-pats'
  PATS.forEach(([name, desc]) => {
    const row = mk('div','ref-row')
    row.innerHTML = `<div class="ref-mod">${escH(name)}</div><div class="ref-desc">${escH(desc)}</div>`
    pList.appendChild(row)
  })
  body.append(pHdr, pList)

  wrap.appendChild(body)
  return wrap
}

function insertAtCursor(text) {
  const ta = $('#editor-ta'); if (!ta) return
  const {selectionStart:s,selectionEnd:e,value:v} = ta
  ta.value = v.slice(0,s)+text+v.slice(e)
  ta.selectionStart = ta.selectionEnd = s+text.length
  ta.dispatchEvent(new Event('input'))
  ta.focus()
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function buildTabBar() {
  const bar = mk('div','tab-bar'); bar.id='tab-bar'
  if (!S.tabs.length) {
    bar.appendChild(mkt('span','tabs-hint','No files open'))
  } else {
    S.tabs.forEach(t => {
      const diags = S.diagsByFile[t.path]||[]
      const errs = diags.filter(d=>d.kind==='error').length
      const tab = mk('div', t.id===S.activeTab?'tab active':'tab')
      tab.dataset.a='tab:click'; tab.dataset.id=t.id
      const [ic,il] = fileIcon(t.name)
      const errBadge = errs ? `<span class="tab-err-badge">${errs}</span>` : ''
      tab.innerHTML = `<span class="ficon ${ic} small">${il}</span>
        <span class="tab-lbl">${escH(t.name)}${t.dirty?'<span class="dot"></span>':''}${errBadge}</span>
        <button class="tab-x" data-a="tab:close" data-id="${t.id}" title="Close">x</button>`
      bar.appendChild(tab)
    })
  }
  bar.appendChild(mk('div','tab-fill'))
  return bar
}

// ── Editor area ───────────────────────────────────────────────────────────────
function buildEditorArea() {
  const area = mk('div','editor-area'); area.id='editor-area'
  const tab = S.tabs.find(t=>t.id===S.activeTab)
  if (!tab) { area.appendChild(buildWelcome()); return area }

  const lines = tab.content.split('\n')
  const tabDiags = S.diagsByFile[tab.path]||[]
  const diagByLine = {}
  tabDiags.forEach(d => { if (!diagByLine[d.line]) diagByLine[d.line]=d })

  // Gutter
  const gutter = mk('div','gutter'); gutter.id='gutter'
  lines.forEach((lineText, i) => {
    const lineNo = i+1
    const d = diagByLine[lineNo]
    const ln = mk('div', d ? 'ln diag-ln-'+d.kind : 'ln')
    ln.textContent = lineNo
    if (d) ln.title = d.message
    ln.dataset.lineNo = lineNo
    ln.addEventListener('click', function(e){
      e.stopPropagation()
      const ta = document.getElementById('editor-ta')
      if (!ta) return
      const v = ta.value, ls = v.split('\n')
      let pos = 0
      for (let j = 0; j < lineNo-1; j++) pos += ls[j].length + 1
      const end = pos + (ls[lineNo-1]||'').length
      ta.focus(); ta.setSelectionRange(pos, end)
    })
    gutter.appendChild(ln)
  })

  // Highlight layer — position:absolute, transform-synced to textarea scroll
  const hl = mk('div','hl'); hl.id='hl'
  if (lines.length > 500) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < lines.length; i++) {
      const d = document.createElement('div')
      d.className = 'cl'
      d.textContent = lines[i] || ' '
      frag.appendChild(d)
    }
    hl.appendChild(frag)
  } else {
    hl.innerHTML = tab.lang==='nim'
      ? hlCodeWithDiags(tab.content, diagByLine)
      : lines.map(l=>'<div class="cl">'+escH(l)+'</div>').join('')
  }

  // Squiggle layer
  const sq = mk('div','squiggle-layer'); sq.id='sq'
  tabDiags.forEach(d => {
    const lineText = lines[d.line-1]||''
    const colStart = Math.max(0, d.col-1)
    const CW = 7.825
    const left = 16 + colStart*CW
    const width = Math.max(CW*3, (lineText.length-colStart)*CW)
    const top = 12 + (d.line-1)*22 + 19
    const s = mk('div','sq sq-'+d.kind)
    s.style.cssText = 'left:'+left+'px;top:'+top+'px;width:'+Math.min(width,900)+'px'
    s.title = d.kind+': '+d.message
    sq.appendChild(s)
  })

  // Current line highlight
  const curLine = mk('div','cur-line-hl'); curLine.id='cur-line-hl'
  curLine.style.top = '12px'

  // Textarea — the ONLY scroll container. Fills code-pane completely.
  // hl/sq are absolutely positioned siblings that move via CSS transform
  // in onEditorScroll to stay aligned with the scrolled text.
  const ta = document.createElement('textarea')
  ta.id='editor-ta'; ta.value=tab.content
  ta.spellcheck=false; ta.autocomplete='off'
  ta.setAttribute('autocorrect','off'); ta.setAttribute('autocapitalize','off')
  ta.addEventListener('input',   onEditorInput)
  ta.addEventListener('keydown', onEditorKey)
  ta.addEventListener('scroll',  onEditorScroll)
  ta.addEventListener('click',   onEditorClick)
  ta.addEventListener('keyup',   onEditorClick)

  // code-pane: overflow:hidden, clips the hl/sq layers
  const pane = mk('div','code-pane'); pane.id='code-pane'
  pane.append(curLine, hl, sq, ta)

  area.append(gutter, pane)
  return area
}


// updateMinimapViewport defined in onEditorScroll section

let _lastResizeH = 0, _lastResizeW = 0

// resizeTextarea is a no-op — textarea fills pane via CSS (width:100% height:100%)
// and scrolls natively. hl/sq are synchronized via CSS transform in onEditorScroll.
function resizeTextarea() {}

function hlCodeWithDiags(code, diagByLine) {
  const lines = code.split('\n')
  let depth = 0
  return lines.map((line, i) => {
    const [html, newDepth] = hlLine(line, depth)
    depth = newDepth
    const d = diagByLine[i+1]
    const ghost = d ? `<span class="inline-err ie-${d.kind}" title="${escH(d.message)}"> <- ${escH(d.message)}</span>` : ''
    return `<div class="cl">${html}${ghost}</div>`
  }).join('')
}

function buildWelcome() {
  const w = mk('div','welcome')
  const recentFiles = recent().slice(0,5)
  w.innerHTML = `
    <svg class="wlc-logo" width="72" height="72" viewBox="0 0 72 72" fill="none">
      <path d="M36 4L8 19v34l28 15 28-15V19z" fill="#f97316" opacity=".1"/>
      <path d="M36 4L8 19v34l28 15 28-15V19z" stroke="#f97316" stroke-width="2"/>
      <path d="M36 4v66M8 19l28 15 28-15" stroke="#f97316" stroke-width="1" opacity=".3"/>
      <text x="36" y="45" text-anchor="middle" font-size="16" font-family="'Geist Mono',monospace" fill="#f97316" font-weight="700">Fs</text>
    </svg>
    <h1 class="wlc-h1">Ferrum Studio</h1>
    <p class="wlc-sub">The professional IDE built exclusively for Nim</p>
    <div class="wlc-btns">
      <button class="wbtn primary" data-a="open:folder">Open Folder</button>
      <button class="wbtn" data-a="file:new">＋ New File</button>
      <button class="wbtn" data-a="open:file">Open File</button>
      <button class="wbtn" data-a="scaffold:open">New Nim Project</button>
      <button class="wbtn" data-a="template:open">From Template</button>
      <button class="wbtn" data-a="do:quickopen">Quick Open</button>
    </div>
    ${recentFiles.length ? `
    <div class="wlc-recent">
      <div class="wlc-recent-title">Recent files</div>
      ${recentFiles.map(p=>`<div class="wlc-recent-item" data-a="recent:open" data-path="${escH(p)}">${escH(bn(p))}<span class="wlc-recent-path">${escH(p)}</span></div>`).join('')}
    </div>` : ''}
    <div class="wlc-features">
      <div class="wlc-feat"><span class="feat-key">F5</span><span>Run file</span></div>
      <div class="wlc-feat"><span class="feat-key">F6</span><span>Run with args</span></div>
      <div class="wlc-feat"><span class="feat-key">F7</span><span>nimble build</span></div>
      <div class="wlc-feat"><span class="feat-key">F8</span><span>nimble test</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+S</span><span>Save & Check</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+P</span><span>Quick Open</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+F</span><span>Find in file</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+G</span><span>Go to line</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+=</span><span>Bigger font</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+-</span><span>Smaller font</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+Shift+W</span><span>Word wrap</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+W</span><span>Close tab</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+D</span><span>Select next</span></div>
      <div class="wlc-feat"><span class="feat-key">Tab</span><span>Expand snippet</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+Shift+C</span><span>Check errors</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+Shift+F</span><span>Format</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+/</span><span>Toggle comment</span></div>
    </div>`
  return w
}

// ── Bottom panel ──────────────────────────────────────────────────────────────
function buildResizeH() {
  const h = mk('div','resize-h'); h.dataset.drag='term'; return h
}

function buildBottomPanel() {
  const panel = mk('div','term-panel'); panel.id='term-panel'
  panel.style.height = S.termH+'px'

  // Tab bar
  const bar = mk('div','term-bar')
  bar.innerHTML = `
    <div class="panel-tab ${S.activePanel==='terminal'?'active':''}" data-a="panel:terminal">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <polyline points="1,3 5,6 1,9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <line x1="5" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg> Terminal
    </div>
    <div class="panel-tab ${S.activePanel==='problems'?'active':''}" id="tab-problems" data-a="panel:problems">
      ! Problems<span id="prob-badge" class="prob-bdg hidden"></span>
    </div>
    <div class="panel-tab ${S.activePanel==='tests'?'active':''}" id="tab-tests" data-a="panel:tests">
      Tests<span id="test-badge" class="prob-bdg hidden"></span>
    </div>
    <div class="panel-tab ${S.activePanel==='build'?'active':''}" data-a="panel:build">
      Build Output
    </div>
    <div class="term-spacer"></div>
    <button class="icon-btn" data-a="term:clear" title="Clear">⌫</button>
    <button class="icon-btn" data-a="term:toggle" title="Toggle panel">―</button>`
  panel.appendChild(bar)

  // Terminal body
  const termBody = mk('div','panel-body'); termBody.id='body-terminal'
  if (S.activePanel !== 'terminal') termBody.classList.add('hidden')
  const out = mk('div','term-out'); out.id='term-out'
  const inRow = mk('div','term-in-row')
  const ps = mkt('span','term-ps','>'); ps.id='term-ps'
  const inp = document.createElement('input')
  inp.type='text'; inp.id='term-in'; inp.autocomplete='off'; inp.spellcheck=false
  inp.placeholder='nim r src/main.nim   |   type help'
  inp.addEventListener('keydown', onTermKey)
  out.addEventListener('click', () => inp.focus())
  inRow.append(ps, inp)
  termBody.append(out, inRow)

  // Problems body
  const probBody = mk('div','panel-body'); probBody.id='body-problems'
  if (S.activePanel !== 'problems') probBody.classList.add('hidden')
  probBody.appendChild(buildProblemsContent())

  // Tests body
  const testBody = mk('div','panel-body'); testBody.id='body-tests'
  if (S.activePanel !== 'tests') testBody.classList.add('hidden')
  testBody.appendChild(buildTestsContent())

  // Build output body (reuses terminal output)
  const buildBody = mk('div','panel-body'); buildBody.id='body-build'
  if (S.activePanel !== 'build') buildBody.classList.add('hidden')
  const buildOut = mk('div','term-out'); buildOut.id='build-out'
  buildBody.appendChild(buildOut)

  panel.append(termBody, probBody, testBody, buildBody)
  return panel
}

function buildProblemsContent() {
  const wrap = mk('div','problems-wrap')
  const list = mk('div','problems-list'); list.id='prob-list'
  updateProblems(list)
  wrap.appendChild(list)
  return wrap
}

function updateProblems(list) {
  list = list || $('#prob-list'); if (!list) return
  const all = []
  for (const [file, diags] of Object.entries(S.diagsByFile)) {
    diags.forEach(d => all.push({...d, file}))
  }
  const errs  = all.filter(d => d.kind === 'error').length
  const warns = all.filter(d => d.kind === 'warning').length

  // Update status badges
  const badge = $('#prob-badge')
  if (badge) {
    if (errs || warns) {
      badge.textContent = errs ? String(errs) : String(warns)
      badge.className = errs ? 'prob-bdg err' : 'prob-bdg warn'
    } else {
      badge.className = 'prob-bdg hidden'
    }
  }
  updateDiagStatus(errs, warns)

  if (!all.length) {
    list.innerHTML = '<div class="prob-empty">OK No problems detected</div>'
    return
  }

  const order = { error: 0, warning: 1, note: 2 }
  all.sort((a, b) =>
    (order[a.kind] || 3) - (order[b.kind] || 3) ||
    a.file.localeCompare(b.file) ||
    a.line - b.line
  )

  const byFile = {}
  all.forEach(d => {
    if (!byFile[d.file]) byFile[d.file] = []
    byFile[d.file].push(d)
  })

  list.innerHTML = ''
  for (const [file, diags] of Object.entries(byFile)) {
    const fErrs  = diags.filter(d => d.kind === 'error').length
    const fWarns = diags.filter(d => d.kind === 'warning').length
    const fRow = mk('div', 'prob-file-row')
    fRow.innerHTML =
      '<span class="prob-fname">' + escH(bn(file)) + '</span>' +
      '<span class="prob-fpath">' + escH(file) + '</span>' +
      (fErrs  ? '<span class="prob-cnt err">'  + fErrs  + '</span>' : '') +
      (fWarns ? '<span class="prob-cnt warn">' + fWarns + '</span>' : '')
    list.appendChild(fRow)

    // Use enhanced rendering — human-readable explanation + fix suggestion
    diags.forEach(d => {
      const html = buildEnhancedProblemItem(d)
      const temp = document.createElement('div')
      temp.innerHTML = html
      const row = temp.firstElementChild
      if (row) list.appendChild(row)
    })
  }
}

function buildTestsContent() {
  const wrap = mk('div','tests-wrap')
  const hdr = mk('div','tests-toolbar')
  const runBtn = mkt('button','wbtn small','+ Run Tests')
  runBtn.dataset.a = 'z:test'
  hdr.appendChild(runBtn)
  wrap.appendChild(hdr)
  const list = mk('div','tests-list'); list.id='tests-list'
  renderTestResults(list)
  wrap.appendChild(list)
  return wrap
}

function renderTestResults(list) {
  list = list || $('#tests-list'); if (!list) return
  const badge = $('#test-badge')
  if (!S.testResults.length) {
    list.innerHTML = '<div class="prob-empty">No test results yet. Press F8 or click Run Tests.</div>'
    if (badge) badge.className='prob-bdg hidden'
    return
  }
  const passed = S.testResults.filter(t=>t.status==='pass').length
  const failed = S.testResults.filter(t=>t.status==='fail').length
  if (badge) {
    badge.textContent = failed ? `${failed} fail` : `${passed} pass`
    badge.className = failed ? 'prob-bdg err' : 'prob-bdg ok'
  }
  list.innerHTML = ''
  const summary = mk('div','test-summary')
  summary.innerHTML = `
    <span class="ts-pass">OK ${passed} passed</span>
    ${failed?`<span class="ts-fail">x ${failed} failed</span>`:''}
    <span class="ts-total">${S.testResults.length} total</span>`
  list.appendChild(summary)
  S.testResults.forEach(t => {
    const row = mk('div', `test-row ${t.status}`)
    row.innerHTML = `
      <span class="test-icon">${t.status==='pass'?'OK':'x'}</span>
      <span class="test-name">${escH(t.name)}</span>
      ${t.output?`<pre class="test-output">${escH(t.output)}</pre>`:''}`
    list.appendChild(row)
  })
}

// ── Status bar ────────────────────────────────────────────────────────────────
function buildStatusBar() {
  const bar = mk('div','status-bar')
  bar.innerHTML = `
    <div id="sb-l">
      <span id="sb-branch">branch: ${S.gitStatus.branch||'main'}</span>
      <span id="sb-run-ind" class="hidden">running</span>
    </div>
    <div id="sb-r">
      <span id="sb-diag-err" class="sb-diag sb-err hidden"></span>
      <span id="sb-diag-warn" class="sb-diag sb-warn hidden"></span>
      <span id="sb-pos">Ln 1, Col 1</span>
      <span id="sb-lang">Nim</span>
      <span id="sb-enc">UTF-8</span>
      <span id="nim-badge" style="cursor:pointer" title="Nim version">nim ${S.nimInfo.version}</span>
    </div>`
  return bar
}

function updateDiagStatus(errs, warns) {
  const ee = $('#sb-diag-err'), ew = $('#sb-diag-warn')
  if (ee) { if(errs){ee.textContent=`x ${errs}`;ee.classList.remove('hidden')}else ee.classList.add('hidden') }
  if (ew) { if(warns){ew.textContent=`! ${warns}`;ew.classList.remove('hidden')}else ew.classList.add('hidden') }
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function buildArgsDialog() {
  const dlg = mk('div','dialog-bg hidden'); dlg.id='args-dlg'
  dlg.innerHTML = `<div class="dialog">
    <div class="dlg-title">Run with arguments</div>
    <div class="dlg-body">
      <div class="dlg-hint">Arguments passed after <code>--</code> to your program</div>
      <div class="dlg-row">
        <span class="dlg-pre" id="args-prefix">nim r &lt;file&gt; </span>
        <input id="args-in" class="dlg-input" type="text" placeholder="./mydir  or  arg1 arg2" autocomplete="off"/>
      </div>
    </div>
    <div class="dlg-footer">
      <button class="wbtn" data-a="dlg:cancel">Cancel</button>
      <button class="wbtn primary" data-a="dlg:run">Run</button>
    </div>
  </div>`
  return dlg
}

function buildNewItemDialog() {
  const dlg = mk('div','dialog-bg hidden'); dlg.id='newitem-dlg'
  dlg.innerHTML = `<div class="dialog">
    <div class="dlg-title" id="newitem-title">New File</div>
    <div class="dlg-body">
      <div class="dlg-row">
        <span class="dlg-pre">Name:</span>
        <input id="newitem-in" class="dlg-input" type="text" placeholder="main.nim" autocomplete="off"/>
      </div>
    </div>
    <div class="dlg-footer">
      <button class="wbtn" data-a="newitem:cancel">Cancel</button>
      <button class="wbtn primary" data-a="newitem:ok">Create</button>
    </div>
  </div>`
  return dlg
}

function buildScaffoldDialog() {
  const dlg = mk('div','dialog-bg hidden'); dlg.id='scaffold-dlg'
  dlg.innerHTML = `<div class="dialog">
    <div class="dlg-title">New Nim Project</div>
    <div class="dlg-body">
      <div class="dlg-hint">Creates a new Nim project using <code>nimble init</code></div>
      <div class="dlg-row">
        <span class="dlg-pre">Directory:</span>
        <input id="scaffold-dir" class="dlg-input" type="text" placeholder="/home/user/my-project" autocomplete="off"/>
      </div>
    </div>
    <div class="dlg-footer">
      <button class="wbtn" data-a="scaffold:cancel">Cancel</button>
      <button class="wbtn primary" data-a="scaffold:create">Create</button>
    </div>
  </div>`
  return dlg
}

// ── Event wiring ──────────────────────────────────────────────────────────────
function wireAll() {
  document.addEventListener('click', e => {
    // Close autocomplete on outside click
    if (!e.target.closest('#ac-popup') && !e.target.closest('#editor-ta')) acClose()
    // Close ctx menu
    if (!e.target.closest('#ctx-menu')) $('#ctx-menu')?.remove()

    const el = e.target.closest('[data-a]')
    if (!el) return
    dispatch(el.dataset.a, el, e)
  })

  document.addEventListener('keydown', onGlobalKey)
  document.addEventListener('mousedown', e => {
    const d = e.target.closest('[data-drag]')?.dataset?.drag
    if (d) { e.preventDefault(); S.drag=d }
  })
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', () => { S.drag=null })

  // Find input events
  document.addEventListener('input', e => {
    if (e.target.id==='find-in') doFind()
    if (e.target.id==='find-case'||e.target.id==='find-regex') doFind()
  })

  // Wails events
  wOn('nim:out',   data => tPrint(data))

  // Listen for template application from enhancements.js
  window.addEventListener('ferrum:template-applied', async e => {
    const { files, root } = e.detail
    // Refresh tree
    S.tree = await go('GetFileTree', root)
    reRenderSidebar()
    // Open the first .zig file
    const mainFile = files.find(f => f.name.endsWith('.nim'))
    if (mainFile) {
      await addTab(mainFile.path, mainFile.name, mainFile.content, 'nim')
    }
    tLine('Template applied! Files created in ' + root, '#4ade80')
  })
  wOn('nim:done',  code => onNimDone(code))
  wOn('nim:diags', diags => applyDiags(diags))
  wOn('test:results', results => applyTestResults(results))
}

function onGlobalKey(e) {
  const aid = document.activeElement?.id
  // Never steal from text inputs
  if (['term-in','args-in','newitem-in','scaffold-dir','find-in'].includes(aid)) return

  const mod = e.ctrlKey||e.metaKey, sh = e.shiftKey
  if (mod&&e.key==='s')             { e.preventDefault(); cmdSaveAndCheck(); return }
  if (mod&&sh&&(e.key==='F'||e.key==='f')) { e.preventDefault(); cmdFmt(); return }
  if (mod&&sh&&(e.key==='C'||e.key==='c')) { e.preventDefault(); cmdCheck(); return }
  if (mod&&e.key==='/')             { e.preventDefault(); toggleComment(); return }
  if (mod&&e.key==='f')             { e.preventDefault(); openFind(); return }
  if (mod&&e.key==='p')             { e.preventDefault(); openQuickOpen(); return }
  if (mod&&e.key==='g')             { e.preventDefault(); openGotoLine(); return }
  if (mod&&(e.key==='='||e.key==='+')){ e.preventDefault(); zoomFont(1); return }
  if (mod&&e.key==='-')              { e.preventDefault(); zoomFont(-1); return }
  if (mod&&e.key==='0')              { e.preventDefault(); PREFS.fontSize=13; savePrefs(); applyPrefs(); return }
  if (mod&&e.key==='n')             { e.preventDefault(); cmdNewFile(); return }
  if (mod&&e.key==='o')             { e.preventDefault(); cmdOpenFile(); return }
  if (mod&&e.key==='w')             { e.preventDefault(); closeActiveTab(); return }
  if (e.key==='F5')                 { e.preventDefault(); cmdRun(); return }
  if (e.key==='F6')                 { e.preventDefault(); showArgsDialog(); return }
  if (e.key==='F7')                 { e.preventDefault(); cmdBuild(); return }
  if (e.key==='F8')                 { e.preventDefault(); cmdTest(); return }
  if (e.key==='Escape')             { closeAllDialogs(); closeFind(); closeQuickOpen(); return }
  // Font size
  if (mod && (e.key==='+' || e.key==='=' || e.key==='+')) { e.preventDefault(); adjustFontSize(1); return }
  if (mod && e.key==='-')             { e.preventDefault(); adjustFontSize(-1); return }
  if (mod && e.key==='0')             { e.preventDefault(); adjustFontSize(0); return }
  if (mod&&e.key==='a' && document.activeElement?.id!=='editor-ta') {
    // Ctrl+A in editor is native; only intercept when editor isn't focused
    const ta = document.getElementById('editor-ta')
    if (ta && document.activeElement !== ta) { ta.focus(); ta.select() }
  }
}

// ── Action dispatcher ─────────────────────────────────────────────────────────
function dispatch(a, el, e) {
  switch (a) {
    case 'open:folder':   cmdOpenFolder(); break
    case 'open:file':     cmdOpenFile(); break
    case 'file:new':      cmdNewFile(); break
    case 'recent:open':   openRecentFile(el.dataset.path); break
    case 'scaffold:open': openScaffoldDialog(); break
    case 'scaffold:cancel': closeAllDialogs(); break
    case 'template:open':  document.getElementById('template-dlg')?.classList.remove('hidden'); break
    case 'scaffold:create': doScaffold(); break
    case 'tree:dir':      toggleDir(el.closest('[data-path]')?.dataset?.path||el.dataset.path); break
    case 'tree:file':   { const r=el.closest('[data-path]'); openTreeFile(r.dataset.path,r.dataset.name); break }
    case 'tab:click':     activateTab(el.closest('[data-id]').dataset.id); break
    case 'tab:close':     e.stopPropagation(); closeTab(el.dataset.id||el.closest('[data-id]').dataset.id); break
    case 'z:run':         cmdRun(); break
    case 'z:run-args':    showArgsDialog(); break
    case 'z:build':       cmdBuild(); break
    case 'z:test':        cmdTest(); break
    case 'z:fmt':         cmdFmt(); break
    case 'z:check':       cmdCheck(); break
    case 'z:kill':        cmdKill(); break
    case 'panel:terminal':  switchPanel('terminal'); break
    case 'panel:problems':  switchPanel('problems'); break
    case 'panel:tests':     switchPanel('tests'); break
    case 'panel:build':     switchPanel('build'); break
    case 'prob:goto':       gotoError(el); break
    case 'term:clear':      termClear(); break
    case 'term:toggle':     termToggle(); break
    case 'dlg:cancel':      closeAllDialogs(); break
    case 'dlg:run':         runWithArgs(); break
    case 'newitem:cancel':  closeAllDialogs(); break
    case 'newitem:ok':      confirmNewItem(); break
    case 'find:close':      closeFind(); break
    case 'find:next':       findStep(1); break
    case 'find:prev':       findStep(-1); break
    case 'ref:toggle':    { const s=$('#sect-'+el.dataset.sect); if(s){const open=!s.classList.contains('hidden');s.classList.toggle('hidden',open);el.textContent=(open?'>':'v')+el.textContent.slice(1)} break }
    case 'snip:insert':   { const [t,,body]=SNIPPETS.find(([t])=>t===el.dataset.snip)||[]; if(body){const ta=$('#editor-ta');if(ta){const {selectionStart:s,selectionEnd:en,value:v}=ta;const c0=body.indexOf('$0');const bef=c0>=0?body.slice(0,c0).replace(/\$\d/g,''):'';const exp=body.replace(/\$\d/g,'');ta.value=v.slice(0,s)+exp+v.slice(en);ta.selectionStart=ta.selectionEnd=s+bef.length;ta.dispatchEvent(new Event('input'));ta.focus()}} break }
    case 'build:step':    { const step=el.dataset.name||el.closest('[data-name]')?.dataset?.name; if(step) runBuildStep(step); break }
    case 'build:refresh': go('GetBuildSteps').then(s=>{if(s)S.buildSteps=s;renderBuildPanel()}); break
    case 'do:save':   cmdSaveAndCheck(); break
    case 'do:saveas': cmdSaveAs(); break
    case 'saveas:cancel': $('#saveas-dlg')?.classList.add('hidden'); break
    case 'saveas:ok': confirmSaveAs(); break
    case 'do:close':  closeActiveTab(); break
    case 'do:find':   openFind(); break
    case 'do:quickopen': openQuickOpen(); break
    case 'ctx:open':      openTreeFile(S.ctxNode?.path, S.ctxNode?.name); break
    case 'ctx:newfile':   promptNewItem(S.ctxNode?.path, false); break
    case 'ctx:newdir':    promptNewItem(S.ctxNode?.path, true); break
    case 'ctx:rename':    promptRename(S.ctxNode); break
    case 'ctx:delete':    confirmDelete(S.ctxNode); break
    case 'ctx:copy-path': navigator.clipboard?.writeText(S.ctxNode?.path||''); break
    case 'm:file': showMenu(el,[
      ['New File         Ctrl+N',    'file:new'],
      ['Open File        Ctrl+O',    'open:file'],
      ['Open Folder',                'open:folder'],
      ['New Nim Project', 'scaffold:open'],
      ['New from Template…', 'template:open'],
      null,
      ['Save             Ctrl+S',    'do:save'],
      ['Save As…',                   'do:saveas'],
      null,
      ['Close Tab        Ctrl+W',    'do:close'],
    ]); break
    case 'm:edit': showMenu(el,[
      ['Find             Ctrl+F',    'do:find'],
      ['Quick Open       Ctrl+P',    'do:quickopen'],
      null,
      ['Format     Ctrl+Shift+F',    'z:fmt'],
      ['Word Wrap  Ctrl+Shift+W',  'do:wordwrap'],
      ['Check      Ctrl+Shift+C',    'z:check'],
      ['Comment/Uncomment Ctrl+/',   'do:comment'],
    ]); break
    case 'm:run': showMenu(el,[
      ['Run              F5',        'z:run'],
      ['Run with args…   F6',        'z:run-args'],
      ['Build            F7',        'z:build'],
      ['Test             F8',        'z:test'],
      null,
      ['Stop process',               'z:kill'],
    ]); break
    case 'm:nim': showMenu(el,[
      ['nimble build',                  'nim:build'],
      ['nim c -d:release <file>',     'nim:build-exe'],
      ['nim c --app:lib <file>',      'nim:build-lib'],
      ['nimble init (new project)',     'scaffold:open'],
      null,
      ['nim dump',                    'nim:env'],
      ['nim --listsyntaxonly',                'nim:targets'],
      ['nim --version',              'nim:version'],
    ]); break
    case 'm:view': showMenu(el,[
      ['Terminal',         'panel:terminal'],
      ['Problems',         'panel:problems'],
      ['Test Results',     'panel:tests'],
      ['Build Output',     'panel:build'],
      null,
      ['Toggle Panel',     'term:toggle'],
      ['Go to Line  Ctrl+G', 'do:gotoline'],
      ['Clear Terminal',   'term:clear'],
    ]); break
    case 'do:comment': toggleComment(); break
    case 'do:wordwrap': toggleWordWrap(); break
    case 'do:gotoline': openGotoLine(); break
    case 'settings:open': $$('.act-btn').forEach(b=>b.classList.remove('active')); document.querySelector('[data-pnl="settings"]')?.classList.add('active'); $$('.sb-panel').forEach(p=>p.classList.toggle('hidden',p.id!=='pnl-settings')); break
    case 'nim:build':    runNim('nimble build'); break
    case 'nim:build-exe':{ const t=activeTab(); if(t?.path)runNim(`c -d:release ${t.path}`); break }
    case 'nim:build-lib':{ const t=activeTab(); if(t?.path)runNim(`c --app:lib ${t.path}`); break }
    case 'nim:env':      runNim('dump'); break
    case 'nim:targets':  runNim('--listsyntaxonly'); break
    case 'nim:version':  go('NimVersion').then(v=>tPrint((v||'?')+'\n')); break
    case 'nim:which':    tPrint('nim: '+S.nimInfo.path+'\n'); break
  }
}

// ── Editor handlers ───────────────────────────────────────────────────────────
function onEditorInput(e) {
  const ta = e.target
  const tab = activeTab(); if (!tab) return
  tab.content = ta.value; tab.dirty = true

  updateCursorPos(ta)
  updateTabDot(tab.id)

  // Debounced highlight: 50ms for small files, 80ms for large ones
  clearTimeout(S._hlTimer)
  const hlDelay = tab.content.length > 30000 ? 80 : 50
  S._hlTimer = setTimeout(function() {
    redrawHL()
    var lc = tab.content.split('\n').length
    if (lc !== S._lastLineCount) {
      S._lastLineCount = lc
      redrawGutter()
          }
  }, hlDelay)

  clearTimeout(S._acTimer)
  S._acTimer = setTimeout(function() { acUpdate(ta) }, 180)

  if (tab.path) {
    clearTimeout(S.checkTimer)
    // Larger files get a longer debounce to avoid hammering zig ast-check
    const checkDelay = tab.content.length > 50000 ? 4000 : 2500
    S.checkTimer = setTimeout(function() { autoCheck(tab) }, checkDelay)
  }
  // Minimap full redraw at low priority — 400ms debounce, doesn't block typing
  clearTimeout(S._mmTimer)
  S._mmTimer = setTimeout(updateMinimap, 400)
}

function updateCursorPos(ta) {
  if (!ta) { ta = document.getElementById('editor-ta'); if (!ta) return }
  var pos = ta.selectionStart
  var before = ta.value.substring(0, pos)
  var lineNo = 1, lastNL = -1
  for (var i = 0; i < before.length; i++) {
    if (before.charCodeAt(i) === 10) { lineNo++; lastNL = i }
  }
  var col = pos - lastNL
  var el = document.getElementById('sb-pos')
  if (el) el.textContent = 'Ln ' + lineNo + ', Col ' + col
  var cl = document.getElementById('cur-line-hl')
  if (cl) cl.style.top = (12 + (lineNo - 1) * 22) + 'px'
  // Bracket match highlight
  highlightMatchingBracket(ta)
}

function highlightMatchingBracket(ta) {
  // Remove old highlights
  document.querySelectorAll('.br-match').forEach(el => el.classList.remove('br-match'))
  if (!ta) return
  const v = ta.value
  const pos = ta.selectionStart
  if (pos === 0 && pos === ta.selectionEnd) return
  const open  = '([{'
  const close = ')]}'
  const ch = v[pos] || v[pos-1]
  if (!ch) return
  const isOpen  = open.includes(ch)
  const isClose = close.includes(ch)
  if (!isOpen && !isClose) return
  const startPos = open.includes(v[pos]) ? pos : pos - 1
  const startCh  = v[startPos]
  const isSearchingClose = open.includes(startCh)
  const matchOpen  = isSearchingClose ? startCh : close[open.indexOf(startCh) >= 0 ? open.indexOf(startCh) : close.indexOf(startCh)]
  const matchClose = isSearchingClose ? close[open.indexOf(startCh)] : startCh
  let depth = 0, matchPos = -1
  if (isSearchingClose) {
    for (let i = startPos; i < v.length; i++) {
      if (v[i] === matchOpen) depth++
      else if (v[i] === matchClose) { depth--; if (depth === 0) { matchPos = i; break } }
    }
  } else {
    for (let i = startPos; i >= 0; i--) {
      if (v[i] === matchClose) depth++
      else if (v[i] === matchOpen) { depth--; if (depth === 0) { matchPos = i; break } }
    }
  }
  if (matchPos === -1) return
  // Find the .cl div for each position and add class
  const hl = document.getElementById('hl')
  if (!hl) return
  function lineColOf(p) {
    const before = v.slice(0, p)
    const ln = (before.match(/\n/g) || []).length
    const col = p - before.lastIndexOf('\n') - 1
    return { ln, col }
  }
  function markBracket(p) {
    const { ln, col } = lineColOf(p)
    const lineEl = hl.children[ln]
    if (!lineEl) return
    // We can't easily mark a single char in the rendered HTML,
    // so just add a subtle glow to the whole line div
    lineEl.classList.add('br-match')
  }
  markBracket(startPos)
  markBracket(matchPos)
}

async function autoCheck(tab) {
  if (!tab?.path) return
  // Save first
  if (tab.dirty) {
    const err = await go('WriteFile', tab.path, tab.content)
    if (err) return
    tab.dirty = false; updateTabDot(tab.id)
  }
  // Run check — yields to browser between save and check
  const diags = await go('NimCheck', tab.path)
  if (!diags) return
  // Apply in a microtask so any pending keystrokes paint first
  setTimeout(() => applyDiags(diags), 0)
}

function onEditorKey(e) {
  const ta = e.target

  // Autocomplete navigation
  if (AC.open) {
    if (e.key==='ArrowDown') { e.preventDefault(); acMove(1); return }
    if (e.key==='ArrowUp')   { e.preventDefault(); acMove(-1); return }
    if (e.key==='Tab') {
      // Try snippet first, then AC
      if (trySnippet(ta)) { acClose(); return }
      e.preventDefault(); acAccept(ta); return
    }
    // Enter never accepts AC — user must press Tab
    if (e.key==='Enter') { acClose() }
    if (e.key==='Escape') { acClose(); return }
  }

  if (e.key==='Tab') {
    e.preventDefault()
    const {selectionStart:s,selectionEnd:en,value:v} = ta
    if (e.shiftKey) {
      const ls=v.lastIndexOf('\n',s-1)+1
      if (v.slice(ls,ls+4)==='    ') {
        ta.value=v.slice(0,ls)+v.slice(ls+4); ta.selectionStart=ta.selectionEnd=Math.max(ls,s-4)
        const _utab=activeTab(); if(_utab){_utab.content=ta.value;_utab.dirty=true}
        clearTimeout(S._hlTimer); S._hlTimer=setTimeout(function(){redrawHL();var _lc=ta.value.split('\n').length;if(_lc!==S._lastLineCount){S._lastLineCount=_lc;redrawGutter()}resizeTextarea(activeTab())},50)
        updateCursorPos(ta)
      }
    } else if (s===en && trySnippet(ta)) {
      // snippet expanded
    } else {
      ta.value=v.slice(0,s)+'    '+v.slice(en); ta.selectionStart=ta.selectionEnd=s+4
      const _tab=activeTab(); if(_tab){_tab.content=ta.value;_tab.dirty=true}
      clearTimeout(S._hlTimer); S._hlTimer=setTimeout(function(){redrawHL();var lc2=ta.value.split('\n').length;if(lc2!==S._lastLineCount){S._lastLineCount=lc2;redrawGutter()}resizeTextarea(activeTab())},50)
      updateCursorPos(ta)
    }
    return
  }

  if (e.key==='Enter') {
    e.preventDefault()
    acClose()
    const {selectionStart:s,value:v} = ta
    const ls=v.lastIndexOf('\n',s-1)+1
    const line=v.slice(ls,s)
    const indent=line.match(/^(\s*)/)[1]
    const extra=/[{(\[]$/.test(line.trimEnd())?'    ':''
    const ins='\n'+indent+extra
    ta.value=v.slice(0,s)+ins+v.slice(ta.selectionEnd)
    ta.selectionStart=ta.selectionEnd=s+ins.length
    // Direct update — avoids doubling the input event
    const _etab=activeTab(); if(_etab){_etab.content=ta.value;_etab.dirty=true}
    clearTimeout(S._hlTimer); S._hlTimer=setTimeout(function(){redrawHL();var _elc=ta.value.split('\n').length;if(_elc!==S._lastLineCount){S._lastLineCount=_elc;redrawGutter()}resizeTextarea(activeTab())},50)
    updateCursorPos(ta); return
  }

  // Auto-close brackets & quotes
  const pairs={'(':')','[':']','{':'}'}
  if (pairs[e.key]) {
    const {selectionStart:s,selectionEnd:en,value:v}=ta
    if (s===en) {
      e.preventDefault()
      ta.value=v.slice(0,s)+e.key+pairs[e.key]+v.slice(en)
      ta.selectionStart=ta.selectionEnd=s+1
      // Update content directly without retriggering full onEditorInput
      const tab=activeTab(); if(tab){tab.content=ta.value;tab.dirty=true}
      clearTimeout(S._hlTimer)
      S._hlTimer=setTimeout(function(){redrawHL();var lc=ta.value.split('\n').length;if(lc!==S._lastLineCount){S._lastLineCount=lc;redrawGutter()}resizeTextarea(activeTab())},50)
      updateCursorPos(ta)
      return
    }
  }
  // Skip closing bracket if already there
  const closers = new Set([')',']','}'])
  if (closers.has(e.key)) {
    const {selectionStart:s,value:v}=ta
    if (v[s]===e.key) { e.preventDefault(); ta.selectionStart=ta.selectionEnd=s+1; return }
  }

  // Smart Home — go to first non-whitespace, then column 0 on second press
  if (e.key === 'Home' && !e.ctrlKey) {
    e.preventDefault()
    const { selectionStart: pos, value: v } = ta
    const lineStart = v.lastIndexOf('\n', pos-1) + 1
    const lineText = v.slice(lineStart, pos)
    const firstNonWs = lineStart + lineText.match(/^(\s*)/)[1].length
    // If already at first non-ws, go to column 0; otherwise go to first non-ws
    const target = pos === firstNonWs ? lineStart : firstNonWs
    if (e.shiftKey) {
      ta.setSelectionRange(ta.selectionEnd !== pos ? ta.selectionStart : pos, target)
    } else {
      ta.setSelectionRange(target, target)
    }
    updateCursorPos(ta)
    return
  }

  // Ctrl+D — select next occurrence
  if ((e.ctrlKey||e.metaKey)&&e.key==='d') {
    e.preventDefault()
    const s=ta.selectionStart, en=ta.selectionEnd
    if (s===en) { selectNext(ta); return }  // no selection: select word
    if (!mcAddNextMatch(ta)) {
      // No more matches — wrap around
      MC.cursors=[]; MC.active=false
      mcAddNextMatch(ta)
    }
    return
  }
  if (e.key==='Escape') { mcClear(); return }
  if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); cmdSaveAndCheck(); return }
  if ((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='W') { e.preventDefault(); toggleWordWrap(); return }
  if ((e.ctrlKey||e.metaKey)&&e.key==='/')  { e.preventDefault(); toggleComment(); return }
}

function onEditorScroll(e) {
  const ta = e.target
  const t = ta.scrollTop
  const l = ta.scrollLeft
  // Move hl and sq layers to track textarea scroll position.
  // We cannot use scrollTop on these elements because they are
  // position:absolute inside overflow:hidden — it silently does nothing.
  // CSS transform is the only way to move them.
  const tx = 'translate('+(-l)+'px,'+(-t)+'px)'
  const hl = document.getElementById('hl')
  const sq = document.getElementById('sq')
  const cl = document.getElementById('cur-line-hl')
  if (hl) hl.style.transform = tx
  if (sq) sq.style.transform = tx
  if (cl) cl.style.transform = 'translateY('+(-t)+'px)'
  // Sync gutter vertical scroll
  const gu = document.getElementById('gutter')
  if (gu) gu.scrollTop = t
  // Minimap viewport indicator
  _mmScrollRaf && cancelAnimationFrame(_mmScrollRaf)
  _mmScrollRaf = requestAnimationFrame(updateMinimapViewport)
}
let _mmScrollRaf = 0

function updateMinimapViewport() {
  const ta = document.getElementById('editor-ta')
  const vp = document.getElementById('minimap-vp')
  const mm = document.getElementById('minimap')
  if (!ta || !vp || !mm) return
  const mmH = mm.clientHeight || 400
  if (ta.scrollHeight > ta.clientHeight) {
    const frac = ta.scrollTop / ta.scrollHeight
    const vpH  = (ta.clientHeight / ta.scrollHeight) * mmH
    vp.style.top    = (frac * mmH) + 'px'
    vp.style.height = vpH + 'px'
  }
}

function onEditorClick(e) {
  const ta = e.target?.id === 'editor-ta' ? e.target : $('#editor-ta')
  updateCursorPos(ta)
}

// Line cache: stores the last-rendered HTML for each line index
// so we only update DOM nodes whose source line actually changed
const _lineCache = []

function redrawHL() {
  // Minimap is cheap-debounced separately — don't call it on every keystroke
  const hl = document.getElementById('hl')
  const tab = activeTab()
  if (!hl || !tab) return

  const tabDiags = S.diagsByFile[tab.path] || []
  const diagByLine = {}
  tabDiags.forEach(d => { if (!diagByLine[d.line]) diagByLine[d.line] = d })

  const lines = tab.content.split('\n')
  const isZig = tab.lang === 'nim'
  const existingNodes = hl.children

  // Add missing line div nodes
  while (hl.children.length < lines.length) {
    hl.appendChild(document.createElement('div'))
    hl.lastChild.className = 'cl'
  }
  // Remove extra line div nodes
  while (hl.children.length > lines.length) {
    hl.removeChild(hl.lastChild)
    _lineCache.length = lines.length
  }

  // For zig: we need bracket depth which is stateful across lines
  // Recompute from the first changed line onwards (depth may cascade)
  let depth = 0
  let firstChanged = lines.length  // assume nothing changed

  if (isZig) {
    // Detect first changed line
    for (let i = 0; i < lines.length; i++) {
      const cacheKey = lines[i] + '|' + (diagByLine[i+1] ? diagByLine[i+1].kind + diagByLine[i+1].message : '')
      if (_lineCache[i] !== cacheKey) { firstChanged = i; break }
    }
    // Compute bracket depth up to firstChanged
    for (let i = 0; i < firstChanged; i++) {
      const ch = existingNodes[i]
      // Read stored depth from data attribute
      const d = parseInt(ch.dataset.depth || '0', 10)
      depth = d
    }
    // Re-render from firstChanged onwards
    for (let i = firstChanged; i < lines.length; i++) {
      const lineNo = i + 1
      const diag = diagByLine[lineNo]
      const cacheKey = lines[i] + '|' + (diag ? diag.kind + diag.message : '')
      const [html, newDepth] = hlLine(lines[i], depth)
      const ghost = diag
        ? '<span class="inline-err ie-' + diag.kind + '" title="' + escH(diag.message) + '"> <- ' + escH(diag.message) + '</span>'
        : ''
      const el = existingNodes[i]
      const newHTML = html + ghost
      if (el.innerHTML !== newHTML) el.innerHTML = newHTML
      el.dataset.depth = newDepth
      _lineCache[i] = cacheKey
      depth = newDepth
    }
  } else {
    // Non-zig: simple line rendering
    for (let i = 0; i < lines.length; i++) {
      const text = escH(lines[i]) || ' '
      const el = existingNodes[i]
      if (el.textContent !== lines[i]) el.innerHTML = text
      _lineCache[i] = lines[i]
    }
  }
}

function redrawGutter() {
  const gu = $('#gutter'), tab = activeTab(); if (!gu || !tab) return
  const lines = tab.content.split('\n')
  const tabDiags = S.diagsByFile[tab.path] || []
  const diagByLine = {}
  tabDiags.forEach(d => { if (!diagByLine[d.line]) diagByLine[d.line] = d })

  const count = lines.length
  const children = gu.children

  // Add missing line nodes
  while (children.length < count) {
    gu.appendChild(mk('div', 'ln'))
  }
  // Remove extra line nodes
  while (children.length > count) {
    gu.removeChild(gu.lastChild)
  }

  // Update only what changed — avoid setting textContent if already correct
  for (let i = 0; i < count; i++) {
    const el = children[i]
    const lineNo = i + 1
    const d = diagByLine[lineNo]
    const wantClass = d ? 'ln diag-ln-' + d.kind : 'ln'
    const wantText = String(lineNo)
    if (el.className !== wantClass) el.className = wantClass
    if (el.textContent !== wantText) el.textContent = wantText
    if (d && el.title !== d.message) el.title = d.message
    else if (!d && el.title) el.title = ''
  }
}

function redrawSquiggles() {
  const sq=$('#sq'),tab=activeTab(); if(!sq||!tab) return
  sq.innerHTML=''
  const tabDiags=S.diagsByFile[tab.path]||[]
  const lines=tab.content.split('\n')
  tabDiags.forEach(d=>{
    const lineText=lines[d.line-1]||''
    const colStart=Math.max(0,d.col-1)
    const CW=7.825
    const left=16+colStart*CW
    const width=Math.max(CW*3,(lineText.length-colStart)*CW)
    const top=12+(d.line-1)*22
    const s=mk('div',`sq sq-${d.kind}`)
    s.style.cssText=`left:${left}px;top:${top+19}px;width:${Math.min(width,900)}px`
    s.title=`${d.kind}: ${d.message}`
    sq.appendChild(s)
  })
}

function toggleFold(lineNo) {
  // Simple fold: hide lines until matching closing brace
  // TODO: full fold implementation
  console.log('fold', lineNo)
}

let _wordWrap = false
function toggleWordWrap() {
  _wordWrap = !_wordWrap
  const ta    = document.getElementById('editor-ta')
  const hl    = document.getElementById('hl')
  const pane  = document.getElementById('code-pane')
  if (ta) ta.style.whiteSpace    = _wordWrap ? 'pre-wrap' : 'pre'
  if (hl) hl.style.whiteSpace    = _wordWrap ? 'pre-wrap' : 'pre'
  if (pane) pane.style.overflowX  = _wordWrap ? 'hidden' : 'auto'
  tLine((_wordWrap ? 'Word wrap ON' : 'Word wrap OFF') + '  (Ctrl+Shift+W)', '#60a5fa')
}

function toggleComment() {
  const ta = $('#editor-ta'); if (!ta) return
  const {selectionStart:s,selectionEnd:en,value:v} = ta
  const lineStart = v.lastIndexOf('\n',s-1)+1
  const lineEnd = v.indexOf('\n',en)
  const end = lineEnd===-1?v.length:lineEnd
  const line = v.slice(lineStart,end)
  const trimmed = line.trimStart()
  const indent = line.slice(0,line.length-trimmed.length)
  let newLine, offset
  if (trimmed.startsWith('# ')) {
    newLine = indent+trimmed.slice(2); offset=-2
  } else if (trimmed.startsWith('#')) {
    newLine = indent+trimmed.slice(1); offset=-1
  } else {
    newLine = indent+'# '+trimmed; offset=2
  }
  ta.value = v.slice(0,lineStart)+newLine+v.slice(end)
  ta.selectionStart = Math.max(lineStart, s+offset)
  ta.selectionEnd   = Math.max(lineStart, en+offset)
  ta.dispatchEvent(new Event('input'))
}

function selectNext(ta) {
  const {selectionStart:s,selectionEnd:en,value:v} = ta
  const word = v.slice(s,en)
  if (!word) {
    let l=s,r=s
    while(l>0&&/\w/.test(v[l-1]))l--
    while(r<v.length&&/\w/.test(v[r]))r++
    if(l<r){ ta.setSelectionRange(l,r); return }
    return
  }
  const next = v.indexOf(word,en)
  if (next!==-1) { ta.setSelectionRange(next,next+word.length); scrollToLine(ta,next) }
  else { const first=v.indexOf(word); if(first!==-1)ta.setSelectionRange(first,first+word.length) }
}

function scrollToLine(ta, pos) {
  const line = ta.value.slice(0,pos).split('\n').length-1
  const scroller = document.getElementById('editor-ta') || ta
  scroller.scrollTop = Math.max(0,(line-5)*22)
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function tPrint(raw) {
  const out = $('#term-out'); if (!out) return
  const html = escH(raw)
    .replace(/\x1b\[0m/g,      '</span>')
    .replace(/\x1b\[1m/g,      '<span style="font-weight:600">')
    .replace(/\x1b\[2m/g,      '<span style="opacity:.5">')
    .replace(/\x1b\[3m/g,      '<span style="font-style:italic">')
    .replace(/\x1b\[31m/g,     '<span style="color:#f87171">')
    .replace(/\x1b\[32m/g,     '<span style="color:#4ade80">')
    .replace(/\x1b\[33m/g,     '<span style="color:#fbbf24">')
    .replace(/\x1b\[34m/g,     '<span style="color:#60a5fa">')
    .replace(/\x1b\[35m/g,     '<span style="color:#c084fc">')
    .replace(/\x1b\[36m/g,     '<span style="color:#22d3ee">')
    .replace(/\x1b\[1;31m/g,   '<span style="color:#f87171;font-weight:600">')
    .replace(/\x1b\[1;32m/g,   '<span style="color:#4ade80;font-weight:600">')
    .replace(/\x1b\[1;33m/g,   '<span style="color:#fbbf24;font-weight:600">')
    .replace(/\x1b\[[0-9;]*m/g,'')
    .replace(/\r\n/g,'\n').replace(/\r/g,'\n')
  const span = document.createElement('span')
  span.innerHTML = html
  out.appendChild(span)
  out.scrollTop = out.scrollHeight
}

function tLine(txt, color) {
  const out=$('#term-out'); if(!out) return
  const d=mk('div','tline'); d.textContent=txt; if(color)d.style.color=color
  out.appendChild(d); out.scrollTop=out.scrollHeight
}

function bPrint(raw) {
  // Print to build output panel
  const out=$('#build-out'); if(!out) return
  const span=document.createElement('span'); span.textContent=raw
  out.appendChild(span); out.scrollTop=out.scrollHeight
}

function termClear() { const o=$('#term-out'); if(o)o.innerHTML='' }

function termToggle() {
  const p=$('#term-panel'); if(!p) return
  const collapsed=p.dataset.collapsed==='1'
  if (collapsed) {
    $$('#term-panel .panel-body').forEach(b => {
      b.classList.toggle('hidden', b.id !== 'body-'+S.activePanel)
    })
    p.style.height=S.termH+'px'; p.dataset.collapsed='0'
  } else {
    $$('#term-panel .panel-body').forEach(b=>b.classList.add('hidden'))
    p.style.height='32px'; p.dataset.collapsed='1'
  }
}

function switchPanel(which) {
  S.activePanel = which
  $$('#term-panel .panel-body').forEach(b => {
    b.classList.toggle('hidden', b.id !== 'body-'+which)
  })
  $$('.panel-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-a="panel:${which}"]`)?.classList.add('active')
  // Ensure panel is expanded
  const p=$('#term-panel')
  if (p&&p.dataset.collapsed==='1') {
    $$('#term-panel .panel-body').forEach(b=>{b.classList.toggle('hidden',b.id!=='body-'+which)})
    p.style.height=S.termH+'px'; p.dataset.collapsed='0'
  }
}

const _ts = {}
function runNim(argsStr) {
  if (S.running) { tLine('Already running. Press Ctrl+C or Stop.','#fbbf24'); return }
  setRunning(true)
  _ts.t = Date.now()
  tLine('\n$ nim '+argsStr.trim(), '#60a5fa')
  switchPanel('terminal')
  go('RunNim', argsStr.trim())
}

function runBuildStep(name) {
  tLine(`\n$ nim build ${name}`, '#60a5fa')
  switchPanel('build')
  go('RunNim', `build ${name}`)
  setRunning(true)
  _ts.t = Date.now()
}

function onNimDone(code) {
  setRunning(false)
  // Parse GPA leak output from accumulated terminal output
  const termEl = document.getElementById('term-out')
  if (termEl) {
    const termText = termEl.textContent || ''
    const leaks = parseLeaks(termText)
    if (leaks.length) {
      applyDiags(leaks, 'GPA')
      tLine('GPA detected ' + leaks.length + ' memory leak(s) — see Problems panel', '#fbbf24')
      switchPanel('problems')
    }
  }
  const elapsed = _ts.t ? ` (${((Date.now()-_ts.t)/1000).toFixed(2)}s)` : ''
  tLine(code===0 ? `─── OK exit 0${elapsed} ───` : `─── x exit ${code}${elapsed} ───`,
        code===0 ? '#4ade80' : '#f87171')
  tLine('')
  // Refresh git status after build
  go('GetGitStatus').then(gs => { if(gs) { S.gitStatus=gs; updateGitUI() } })
}

function updateNimBadge(info) {
  const b = $('#nim-badge')
  const p = $('#plat-badge')
  const notFound = !info?.version || info.version === 'not found'
  if (b) {
    b.textContent = notFound ? 'nim not found' : 'nim ' + info.version
    b.style.color = notFound ? 'var(--red)' : ''
    b.style.cursor = 'pointer'
    b.title = notFound
      ? 'Nim not found — click to locate or retry detection'
      : 'nim at ' + (info.path || 'nim') + ' — click to change'
    b.onclick = () => showNimSetup()
  }
  if (p) p.textContent = (info?.os || '') + '/' + (info?.arch || '')
  S.nimInfo = info || S.nimInfo
  if (notFound) showNimBanner()
}

function showNimBanner() {
  // Show a dismissible banner at top of editor if zig is not found
  if ($('#nim-banner')) return // already shown
  const banner = mk('div', 'nim-banner')
  banner.id = 'nim-banner'
  banner.innerHTML =
    '<span class="nim-banner-msg">Nim not found on PATH. ' +
    'If you just installed Nim, click <strong>Retry Detection</strong> ' +
    'or <strong>Browse…</strong> to locate it manually.</span>' +
    '<button class="nim-banner-btn" id="nim-retry-btn">R Retry Detection</button>' +
    '<button class="nim-banner-btn" id="nim-browse-btn">Browse...</button>' +
    '<button class="nim-banner-close" id="nim-banner-close">x</button>'
  // Insert before editor area
  const col = document.querySelector('.editor-col')
  const tabBar = $('#tab-bar')
  if (col && tabBar) col.insertBefore(banner, tabBar)

  document.getElementById('nim-retry-btn')?.addEventListener('click', async () => {
    const info = await go('RetryNimDetection')
    if (info && info.version !== 'not found') {
      $('#nim-banner')?.remove()
      updateNimBadge(info)
      tLine('Nim found: ' + info.version + ' at ' + info.path, '#4ade80')
    } else {
      tLine('Still not found. Try Browse… to locate nim manually.', '#f87171')
    }
  })
  document.getElementById('nim-browse-btn')?.addEventListener('click', async () => {
    const ver = await go('BrowseForNim')
    if (ver && !ver.startsWith('not') && !ver.startsWith('empty') && !ver.startsWith('error')) {
      $('#nim-banner')?.remove()
      const info = await go('GetNimInfo')
      updateNimBadge(info)
      tLine('Nim configured: ' + ver + ' at ' + S.nimInfo.path, '#4ade80')
    } else if (ver) {
      tLine('Error: ' + ver, '#f87171')
    }
  })
  document.getElementById('nim-banner-close')?.addEventListener('click', () => {
    $('#nim-banner')?.remove()
  })
}

function showNimSetup() {
  // Inline settings — show current path and offer retry/browse
  const current = S.nimInfo?.path || 'not found'
  const ver = S.nimInfo?.version || 'not found'

  const dlg = mk('div', 'dialog-bg')
  dlg.id = 'nim-setup-dlg'
  dlg.innerHTML = '<div class="dialog">' +
    '<div class="dlg-title">Nim Configuration</div>' +
    '<div class="dlg-body" style="gap:12px">' +
      '<div class="dlg-hint">Current zig: <code id="nim-cur-path">' + escH(current) + '</code></div>' +
      '<div class="dlg-hint">Version: <code>' + escH(ver) + '</code></div>' +
      '<div class="dlg-hint" style="margin-top:4px">If you just installed Zig, retry detection first. ' +
      'If detection fails, use Browse to locate <code>zig.exe</code> manually.</div>' +
      '<div class="dlg-row">' +
        '<input id="nim-manual-path" class="dlg-input" type="text" ' +
          'placeholder="C:\\nim\\bin\\nim.exe or /usr/local/bin/nim" ' +
          'value="' + (current !== 'not found' ? escH(current) : '') + '" autocomplete="off"/>' +
      '</div>' +
    '</div>' +
    '<div class="dlg-footer">' +
      '<button class="wbtn" id="nim-dlg-cancel">Cancel</button>' +
      '<button class="wbtn" id="nim-dlg-browse">Browse...</button>' +
      '<button class="wbtn" id="nim-dlg-retry">R Retry Auto-detect</button>' +
      '<button class="wbtn primary" id="nim-dlg-apply">Apply</button>' +
    '</div>' +
  '</div>'

  document.body.appendChild(dlg)

  document.getElementById('nim-dlg-cancel').addEventListener('click', () => dlg.remove())
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })

  document.getElementById('nim-dlg-retry').addEventListener('click', async () => {
    const info = await go('RetryNimDetection')
    if (info?.version && info.version !== 'not found') {
      dlg.remove(); $('#nim-banner')?.remove()
      updateNimBadge(info)
      tLine('Nim auto-detected: ' + info.version + ' at ' + info.path, '#4ade80')
    } else {
      document.getElementById('nim-cur-path').textContent = 'Still not found — try Browse'
      document.getElementById('nim-cur-path').style.color = 'var(--red)'
    }
  })

  document.getElementById('nim-dlg-browse').addEventListener('click', async () => {
    const ver = await go('BrowseForNim')
    if (ver && !ver.startsWith('not') && !ver.startsWith('empty') && !ver.startsWith('error')) {
      dlg.remove(); $('#nim-banner')?.remove()
      const info = await go('GetNimInfo')
      updateNimBadge(info)
      tLine('Nim set: ' + ver, '#4ade80')
    } else if (ver) {
      tLine('Error: ' + ver, '#f87171')
    }
  })

  document.getElementById('nim-dlg-apply').addEventListener('click', async () => {
    const p = (document.getElementById('nim-manual-path')?.value || '').trim()
    if (!p) return
    const result = await go('SetNimPath', p)
    if (result && !result.startsWith('not') && !result.startsWith('empty') && !result.startsWith('error')) {
      dlg.remove(); $('#nim-banner')?.remove()
      const info = await go('GetNimInfo')
      updateNimBadge(info)
      tLine('Nim set to ' + p + ' (version: ' + result + ')', '#4ade80')
    } else {
      tLine('Failed: ' + (result || 'unknown error') + ' — check the path is correct', '#f87171')
    }
  })
}

function updateGitUI() {
  const b = $('#sb-branch')
  if (b) b.textContent = 'branch: ' + (S.gitStatus.branch||'main')
  if (S.tree) reRenderSidebar() // refresh git markers
}

function setRunning(v) {
  S.running = v
  $('#kill-btn')?.classList.toggle('hidden', !v)
  $('#sb-run-ind')?.classList.toggle('hidden', !v)

  // Update terminal prompt: > when idle, > when process is running
  const ps  = document.getElementById('term-ps')
  const inp = document.getElementById('term-in')
  if (ps) {
    ps.textContent = '>'
    ps.style.color = v ? '#4ade80' : ''
    ps.title = v ? 'Process running — type input here and press Enter to send' : ''
  }
  if (inp) {
    inp.placeholder = v ? 'Type input and press Enter to send (Ctrl+C to kill)' : 'nim r src/main.nim | build | test | help'
    if (v) setTimeout(() => inp.focus(), 80)
  }
}

async function onTermKey(e) {
  const inp = e.target

  // Ctrl+C always kills the process
  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault()
    if (S.running) {
      cmdKill()
      tLine('^C', '#f87171')
    } else {
      inp.value = ''
    }
    return
  }

  if (e.ctrlKey && e.key === 'l') { e.preventDefault(); termClear(); return }

  // ── When a process is running: forward ALL input to its stdin ─────────────
  if (S.running) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const text = inp.value  // send as-is, including empty lines
      // Echo input to terminal so user can see what they typed
      tLine(text, '#e2e8f0')
      inp.value = ''
      await go('SendInput', text)
    }
    // Any other key: let the input field accumulate the text normally
    // (no arrow-up history while process is running)
    return
  }

  // ── Normal shell mode (no process running) ────────────────────────────────
  if (e.key==='ArrowUp') {
    e.preventDefault()
    if (S.termHistIdx < S.termHistory.length-1) {
      S.termHistIdx++
      inp.value = S.termHistory[S.termHistIdx] || ''
    }
    return
  }
  if (e.key==='ArrowDown') {
    e.preventDefault()
    S.termHistIdx = Math.max(-1, S.termHistIdx - 1)
    inp.value = S.termHistIdx >= 0 ? S.termHistory[S.termHistIdx] : ''
    return
  }
  if (e.key !== 'Enter') return

  const raw = inp.value.trim()
  inp.value = ''
  if (!raw) return
  if (S.termHistory[0] !== raw) {
    S.termHistory.unshift(raw)
    if (S.termHistory.length > 500) S.termHistory.pop()
  }
  S.termHistIdx = -1
  tLine('\n> ' + raw, '#7070a0')
  await handleTermCmd(raw)
}

async function handleTermCmd(raw) {
  const p=raw.trim().split(/\s+/), cmd=p[0], tab=activeTab()
  if(cmd==='clear'||cmd==='cls'){termClear();return}
  if(cmd==='help'){
    tPrint('\x1b[33mFerrum Studio — Nim Terminal\x1b[0m\n\n'+
      '  \x1b[2mrun [args]\x1b[0m        nim r <active file> [args]\n'+
      '  \x1b[2mbuild\x1b[0m              nim c -d:release <active file>\n'+
      '  \x1b[2mtest\x1b[0m               nimble test\n'+
      '  \x1b[2mfmt\x1b[0m                nimpretty <active file>\n'+
      '  \x1b[2mcheck\x1b[0m              nim check (shows in Problems)\n'+
      '  \x1b[2mnimble <cmd>\x1b[0m       any nimble command\n'+
      '  \x1b[2mversion\x1b[0m            nim --version\n'+
      '  \x1b[2mclear\x1b[0m              clear terminal\n\n')
    return
  }
  if(cmd==='version'){go('NimVersion').then(v=>tLine(v||'?'));return}
  if(cmd==='which'){tLine('nim: '+S.nimInfo.path);return}
  const needsFile=new Set(['run','test','fmt','check','build-exe','build-lib'])
  if(needsFile.has(cmd)&&!tab?.path){tLine('No saved file open.','#f87171');return}
  if(cmd==='run'){if(tab.dirty)await cmdSaveAndCheck();const rest=p.slice(1).join(' ');runNim(rest?`r ${tab.path} -- ${rest}`:`r ${tab.path}`);return}
  if(cmd==='build'){runNim('nimble build '+p.slice(1).join(' '));return}
  if(cmd==='test'){if(tab.dirty)await cmdSaveAndCheck();runNim(`nimble test`);return}
  if(cmd==='fmt'){if(tab.dirty)await cmdSaveAndCheck();await cmdFmt();return}
  if(cmd==='check'){if(tab.dirty)await cmdSaveAndCheck();await cmdCheck();return}
  if(cmd==='build-exe'){if(tab.dirty)await cmdSaveAndCheck();runNim(`c -d:release ${tab.path}`);return}
  if(cmd==='build-lib'){if(tab.dirty)await cmdSaveAndCheck();runNim(`c --app:lib ${tab.path}`);return}
  if(cmd==='init'){runNim('nimble init');return}
  if(cmd==='env'){runNim('dump');return}
  if(cmd==='version'){runNim('--version');return}
  if(cmd==='nim'){runNim(p.slice(1).join(' '));return}
  if(cmd==='nimble'){runNim('nimble '+p.slice(1).join(' '));return}
  tLine(`command not found: ${cmd}  (type 'help')`, '#f87171')
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
function applyDiags(diags, source) {
  if (!diags) return
  source = source || (diags[0]?.source || 'check')
  // Clear diags from this source only
  for (const file of Object.keys(S.diagsByFile)) {
    S.diagsByFile[file] = S.diagsByFile[file].filter(d => d.source !== source)
    if (!S.diagsByFile[file].length) delete S.diagsByFile[file]
  }
  diags.forEach(d => {
    if (!S.diagsByFile[d.file]) S.diagsByFile[d.file] = []
    S.diagsByFile[d.file].push(d)
  })

  // Invalidate ONLY lines that have diagnostics so they re-render with ghost text
  // Don't zero the whole cache — that forces a full redraw of every line
  const affectedLines = new Set(diags.map(d => d.line - 1))
  affectedLines.forEach(i => { if (i >= 0) _lineCache[i] = null })
  // Also clear lines that previously had diags (now cleared)
  for (let i = 0; i < _lineCache.length; i++) {
    if (_lineCache[i] && _lineCache[i].includes('|') && _lineCache[i].split('|')[1]) {
      _lineCache[i] = null  // had a diag, may now be cleared
    }
  }

  // Redraw editor visuals — fast with line cache, doesn't steal focus
  redrawHL()
  redrawGutter()
  redrawSquiggles()
  updateProblems()

  // Update tab error badges WITHOUT replacing DOM (no focus loss, no scroll jump)
  updateTabBadges()
  // Update tree badges WITHOUT replacing the whole sidebar
  updateTreeBadges()
}

function updateTabBadges() {
  S.tabs.forEach(tab => {
    const el = document.querySelector(`.tab[data-id="${tab.id}"] .tab-lbl`)
    if (!el) return
    const diags = S.diagsByFile[tab.path] || []
    const errs = diags.filter(d => d.kind === 'error').length
    const dot = tab.dirty ? '<span class="dot"></span>' : ''
    const badge = errs ? `<span class="tab-err-badge">${errs}</span>` : ''
    el.innerHTML = escH(tab.name) + dot + badge
  })
}

function updateTreeBadges() {
  // Update per-file badges in the tree without rebuilding it
  document.querySelectorAll('.tree-row.file[data-path]').forEach(row => {
    const path = row.dataset.path
    const diags = S.diagsByFile[path] || []
    const errs  = diags.filter(d => d.kind === 'error').length
    const warns = diags.filter(d => d.kind === 'warning').length
    let badge = row.querySelector('.tree-badge')
    if (!errs && !warns) {
      badge?.remove()
    } else {
      if (!badge) {
        badge = document.createElement('span')
        row.appendChild(badge)
      }
      badge.className = errs ? 'tree-badge err' : 'tree-badge warn'
      badge.textContent = errs || warns
    }
  })
}

function applyTestResults(results) {
  S.testResults = results || []
  renderTestResults()
  const failed = S.testResults.filter(t=>t.status==='fail').length
  if (failed) switchPanel('tests')
}

async function gotoError(el) {
  const file=el.dataset.file, line=parseInt(el.dataset.line), col=parseInt(el.dataset.col)
  if (!file||!line) return
  let tab = S.tabs.find(t=>t.path===file)
  if (!tab) { const c=await go('ReadFile',file); if(c!==null) await addTab(file,bn(file),c,langOf(file)); tab=activeTab() }
  else activateTab(tab.id)
  setTimeout(()=>{
    const ta=$('#editor-ta'); if(!ta) return
    const lines=ta.value.split('\n'); let pos=0
    for(let i=0;i<Math.min(line-1,lines.length);i++) pos+=lines[i].length+1
    pos+=Math.max(0,col-1)
    ta.focus(); ta.setSelectionRange(pos,pos)
    ta.scrollTop = Math.max(0, (line-5)*22)
    onEditorClick({target:ta})
  },60)
}

// ── File commands ─────────────────────────────────────────────────────────────
async function cmdOpenFolder() {
  const path = await go('OpenFolder'); if (!path) return
  S.expanded.add(path); S.tree=await go('GetFileTree',path)
  S.buildSteps = await go('GetBuildSteps') || []
  S.gitStatus  = await go('GetGitStatus')  || S.gitStatus
  reRenderSidebar(); renderBuildPanel(); updateGitUI()
  tLine('\nopened: '+path, '#585878')
}

async function cmdOpenFile() {
  const r = await go('OpenFile'); if (!r) return
  addTab(r.path, bn(r.path), r.content, langOf(r.path))
}

function cmdNewFile() { promptNewItem(null, false) }

function promptNewItem(parentPath, isDir) {
  const dlg=$('#newitem-dlg'); if(!dlg) return
  const title=$('#newitem-title'); if(title)title.textContent=isDir?'New Folder':'New File'
  dlg.dataset.parent=parentPath||S.tree?.path||''
  dlg.dataset.isdir=isDir?'1':'0'
  dlg.classList.remove('hidden')
  const inp=$('#newitem-in'); if(inp){inp.value='';inp.focus()}
}

async function confirmNewItem() {
  const dlg=$('#newitem-dlg'); if(!dlg) return
  const name=($('#newitem-in')?.value||'').trim(); if(!name)return
  const parent=dlg.dataset.parent||'',isDir=dlg.dataset.isdir==='1'
  const full=parent?parent+'/'+name:name
  closeAllDialogs()
  if(isDir){ await go('CreateDir',full) }
  else {
    await go('CreateFile',full)
    const content=name.endsWith('.nim')?'const std = @import("std");\n':''
    addTab(full,name,content,langOf(name))
  }
  if(S.tree){S.tree=await go('GetFileTree',S.tree.path);reRenderSidebar()}
}

function openScaffoldDialog() {
  const dlg=$('#scaffold-dlg'); if(!dlg) return
  const inp=$('#scaffold-dir')
  if (inp) {
    // Pre-fill with current project root so user can just click Create
    inp.value = S.tree?.path || ''
    inp.placeholder = S.tree?.path ? 'Leave empty to use current folder' : 'e.g. C:\\Users\\me\\myproject'
    inp.focus()
  }
  dlg.classList.remove('hidden')
}

async function doScaffold() {
  // Use typed dir, or current project root, or ask user to open a folder first
  const typedDir = ($('#scaffold-dir')?.value||'').trim()
  const dir = typedDir || S.tree?.path || (await go('GetProjectRoot'))
  if (!dir) {
    tLine('Please open a folder first (File -> Open Folder), then create a project.', '#f87171')
    closeAllDialogs()
    return
  }
  closeAllDialogs()
  tLine('\n$ nimble init  (in ' + dir + ')', '#60a5fa')
  const out = await go('ScaffoldProject', dir, 'exe')
  if (out && out.startsWith('error:')) {
    tLine(out, '#f87171')
    return
  }
  tPrint(out || 'Done.\n')
  // Open the project
  S.expanded.add(dir)
  S.tree = await go('GetFileTree', dir)
  S.buildSteps = await go('GetBuildSteps') || []
  reRenderSidebar()
  renderBuildPanel()
  // Try to open main.zig if it exists
  const mainPath = dir + (dir.includes('\\') ? '\\' : '/') + 'src/main.nim'
  const mainContent = await go('ReadFile', mainPath)
  if (mainContent) addTab(mainPath, 'main.nim', mainContent, 'nim')
  tLine('Project ready! Run with F7 (build) or F5 (run).', '#4ade80')
}

async function addTab(path, name, content, lang='text') {
  const ex = path?S.tabs.find(t=>t.path===path):null
  if(ex){activateTab(ex.id);return}
  const id='tab-'+Date.now()
  S.tabs.push({id,path,name,content:content??'',dirty:false,lang})
  S.activeTab=id
  if(path) pushRecent(path)
  reRenderEditor()
}

function activateTab(id){
  _lineCache.length=0; S.activeTab=id; reRenderEditor()
  setTimeout(() => updateBreadcrumb(), 0)
}

async function closeTab(id) {
  const tab=S.tabs.find(t=>t.id===id)
  if(tab?.dirty&&!confirm(`Save "${tab.name}" before closing?`)){/*discard*/}
  else if(tab?.dirty) await cmdSaveAndCheck()
  S.tabs=S.tabs.filter(t=>t.id!==id)
  if(S.activeTab===id) S.activeTab=S.tabs.at(-1)?.id??null
  reRenderEditor()
}

function closeActiveTab(){ if(S.activeTab)closeTab(S.activeTab) }
function toggleDir(path){ S.expanded.has(path)?S.expanded.delete(path):S.expanded.add(path); reRenderSidebar() }
async function openTreeFile(path,name){ const c=await go('ReadFile',path); addTab(path,name,c??'',langOf(name)) }

async function openRecentFile(path) {
  const content = await go('ReadFile', path)
  if (content !== null) addTab(path, bn(path), content, langOf(path))
  else tLine('File not found: '+path, '#f87171')
}

async function cmdSaveAndCheck() {
  const tab=activeTab(); if(!tab) return
  if(!tab.path){await cmdSaveAs();return}
  const err=await go('WriteFile',tab.path,tab.content); if(err){tLine('Save error: '+err,'#f87171');return}
  tab.dirty=false; updateTabDot(tab.id)
  // Auto-check on save
  const diags=await go('NimCheck',tab.path)
  if(diags) applyDiags(diags)
}

async function cmdSaveAs() {
  const tab = activeTab(); if (!tab) return
  // Use an inline prompt dialog — avoids the Windows WebView2 crash
  // from the native SaveFileDialog (Wails v2.12 bug).
  const suggested = tab.path || (S.tree?.path ? S.tree.path + '/' + tab.name : tab.name)
  showSaveAsDialog(suggested)
}

function showSaveAsDialog(suggested) {
  // Build or reuse the save-as dialog
  let dlg = $('#saveas-dlg')
  if (!dlg) {
    dlg = mk('div','dialog-bg'); dlg.id='saveas-dlg'
    dlg.innerHTML = `<div class="dialog">
      <div class="dlg-title">Save As</div>
      <div class="dlg-body">
        <div class="dlg-hint">Enter the full file path to save to</div>
        <div class="dlg-row">
          <input id="saveas-in" class="dlg-input" type="text" autocomplete="off" spellcheck="false"/>
        </div>
      </div>
      <div class="dlg-footer">
        <button class="wbtn" data-a="saveas:cancel">Cancel</button>
        <button class="wbtn primary" data-a="saveas:ok">Save</button>
      </div>
    </div>`
    document.getElementById('ide')?.appendChild(dlg)
  }
  const inp = $('#saveas-in')
  if (inp) { inp.value = suggested; }
  dlg.classList.remove('hidden')
  setTimeout(() => { inp?.focus(); inp?.select() }, 40)
}

async function confirmSaveAs() {
  const tab = activeTab(); if (!tab) return
  const path = $('#saveas-in')?.value?.trim(); if (!path) return
  $('#saveas-dlg')?.classList.add('hidden')
  const err = await go('SaveAs', path, tab.content)
  if (err) { tLine('Save error: ' + err, '#f87171'); return }
  tab.path = path; tab.name = bn(path); tab.lang = langOf(path)
  tab.dirty = false
  pushRecent(path)
  reRenderEditor()
  tLine('Saved: ' + path, '#4ade80')
}

async function cmdRun() {
  const tab=activeTab()
  if(!tab){tLine('No file open.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  if(!tab.path){tLine('Save the file first.','#f87171');return}
  runNim(`r ${tab.path}`)
}

async function cmdBuild() { runNim('nimble build') }

async function cmdTest() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file open.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  S.testResults=[]
  renderTestResults()
  switchPanel('tests')
  runNim(`nimble test`)
}

async function cmdFmt() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file to format.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  tLine('\n$ nimpretty '+tab.name,'#60a5fa')
  const newContent=await go('NimFmt',tab.path)
  if(!newContent){tLine('fmt failed.','#f87171');return}
  tab.content=newContent;tab.dirty=false
  const ta=$('#editor-ta')
  if(ta){ta.value=newContent;ta.dispatchEvent(new Event('input'))}
  else reRenderEditor()
  tLine('formatted.','#4ade80')
}

async function cmdCheck() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file to check.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  tLine('\n$ nim check '+tab.name,'#60a5fa')
  const diags=await go('NimCheck',tab.path)
  applyDiags(diags||[])
  switchPanel('problems')
  const errs=(diags||[]).filter(d=>d.kind==='error').length
  if(!errs)tLine('No errors.','#4ade80')
  else tLine(`x ${errs} error${errs>1?'s':''}  —  see Problems panel.`,'#f87171')
}

function cmdKill(){go('KillProc');if(S.running){setRunning(false);tLine('\nkilled.','#f87171')}}

function showArgsDialog() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file open.','#f87171');return}
  const dlg=$('#args-dlg');if(!dlg)return
  const pre=$('#args-prefix');if(pre)pre.textContent=`nim r ${tab.name} `
  dlg.classList.remove('hidden')
  setTimeout(()=>$('#args-in')?.focus(),40)
}

async function runWithArgs() {
  const tab=activeTab();if(!tab?.path)return
  const args=($('#args-in')?.value||'').trim();closeAllDialogs()
  if(tab.dirty)await cmdSaveAndCheck()
  runNim(args?`r ${tab.path} -- ${args}`:`r ${tab.path}`)
}

// ── Tree context menu ─────────────────────────────────────────────────────────
function showTreeCtx(e, node) {
  S.ctxNode=node
  const items=node.isDir
    ?[['New File','ctx:newfile'],['New Folder','ctx:newdir'],null,['Copy Path','ctx:copy-path']]
    :[['Open','ctx:open'],null,['Rename','ctx:rename'],['Delete','ctx:delete'],null,['Copy Path','ctx:copy-path']]
  const menu=mk('div','ctx-menu');menu.id='ctx-menu'
  menu.style.left=e.clientX+'px';menu.style.top=e.clientY+'px'
  items.forEach(item=>{
    if(!item){menu.appendChild(mk('div','ctx-sep'));return}
    const [l,a]=item;const r=mkt('div','ctx-item',l);r.dataset.a=a;menu.appendChild(r)
  })
  document.body.appendChild(menu)
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),10)
}

async function promptRename(node) {
  if(!node)return
  const newName=prompt('Rename to:',node.name);if(!newName||newName===node.name)return
  const newPath=node.path.replace(/[^/\\]+$/,newName)
  await go('RenamePath',node.path,newPath)
  const tab=S.tabs.find(t=>t.path===node.path)
  if(tab){tab.path=newPath;tab.name=newName;tab.lang=langOf(newName)}
  if(S.tree){S.tree=await go('GetFileTree',S.tree.path);reRenderSidebar()}
  reRenderEditor()
}

async function confirmDelete(node) {
  if(!node)return
  if(!confirm(`Delete "${node.name}"? This cannot be undone.`))return
  await go('DeletePath',node.path)
  const tab=S.tabs.find(t=>t.path===node.path);if(tab)closeTab(tab.id)
  if(S.tree){S.tree=await go('GetFileTree',S.tree.path);reRenderSidebar()}
}

// ── Context menu ──────────────────────────────────────────────────────────────
function showMenu(anchor, items) {
  $('#ctx-menu')?.remove()
  const menu=mk('div','ctx-menu');menu.id='ctx-menu'
  const r=anchor.getBoundingClientRect()
  menu.style.left=r.left+'px';menu.style.top=(r.bottom+2)+'px'
  items.forEach(item=>{
    if(!item){menu.appendChild(mk('div','ctx-sep'));return}
    const [l,a]=item;const row=mkt('div','ctx-item',l);row.dataset.a=a;menu.appendChild(row)
  })
  document.body.appendChild(menu)
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),10)
}

// ── Quick open (Ctrl+P) ───────────────────────────────────────────────────────
let qoIdx=0
function openGotoLine() {
  const ta = document.getElementById('editor-ta')
  if (!ta) return
  const current = ta.value.slice(0, ta.selectionStart).split('\n').length
  const total = ta.value.split('\n').length
  const input = window.prompt ? window.prompt('Go to line (1–' + total + '):', current) : null
  if (!input) return
  const n = parseInt(input, 10)
  if (isNaN(n) || n < 1) return
  const line = Math.min(n, total)
  const v = ta.value, lines = v.split('\n')
  let pos = 0
  for (let i = 0; i < line-1; i++) pos += lines[i].length + 1
  ta.focus()
  ta.setSelectionRange(pos, pos + (lines[line-1]||'').length)
  // Scroll code-pane to show the line
  const scroller = document.getElementById('editor-ta')
  if (scroller) scroller.scrollTop = Math.max(0, (line-5)*22)
}

function openQuickOpen() {
  let qo=$('#quick-open')
  if (!qo) {
    qo=mk('div','quick-open-overlay');qo.id='quick-open'
    qo.innerHTML=`<div class="qo-box">
      <input id="qo-in" class="qo-input" type="text" placeholder="Open file…  (type to filter)" autocomplete="off"/>
      <div id="qo-list" class="qo-list"></div>
    </div>`
    qo.addEventListener('click',e=>{if(e.target===qo)closeQuickOpen()})
    document.body.appendChild(qo)
    const inp=$('#qo-in')
    inp.addEventListener('input',updateQO)
    inp.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();closeQuickOpen();return}
      if(e.key==='ArrowDown'){e.preventDefault();moveQO(1);return}
      if(e.key==='ArrowUp'){e.preventDefault();moveQO(-1);return}
      if(e.key==='Enter'){e.preventDefault();selectQO();return}
    })
  }
  qo.classList.remove('hidden')
  const inp=$('#qo-in');if(inp){inp.value='';inp.focus()}
  qoIdx=0;updateQO()
}

function closeQuickOpen(){ $('#quick-open')?.classList.add('hidden') }

function getQOFiles() {
  const files=[]
  S.tabs.forEach(t=>{if(t.path)files.push({path:t.path,name:t.name,kind:'open'})})
  function walk(n){if(!n)return;if(!n.isDir)files.push({path:n.path,name:n.name,kind:'project'});n.children?.forEach(walk)}
  walk(S.tree)
  recent().forEach(p=>{if(!files.find(f=>f.path===p))files.push({path:p,name:bn(p),kind:'recent'})})
  return files
}

function updateQO() {
  const q=($('#qo-in')?.value||'').toLowerCase()
  const all=getQOFiles()
  const filtered=q?all.filter(f=>f.name.toLowerCase().includes(q)||f.path.toLowerCase().includes(q)):all
  const list=$('#qo-list');if(!list)return
  qoIdx=0
  if(!filtered.length){list.innerHTML='<div class="qo-empty">No files found</div>';return}
  list.innerHTML=filtered.slice(0,12).map((f,i)=>`
    <div class="qo-item${i===0?' sel':''}" data-idx="${i}" data-path="${escH(f.path)}" data-name="${escH(f.name)}">
      <span class="qo-name">${escH(f.name)}</span>
      <span class="qo-path">${escH(f.path)}</span>
      <span class="qo-kind ${f.kind}">${f.kind}</span>
    </div>`).join('')
  list.querySelectorAll('.qo-item').forEach(row=>{
    row.addEventListener('click',()=>{closeQuickOpen();openTreeFile(row.dataset.path,row.dataset.name)})
  })
}

function moveQO(dir){
  const items=$$('#qo-list .qo-item');if(!items.length)return
  items[qoIdx]?.classList.remove('sel')
  qoIdx=Math.max(0,Math.min(items.length-1,qoIdx+dir))
  items[qoIdx]?.classList.add('sel')
  items[qoIdx]?.scrollIntoView({block:'nearest'})
}

function selectQO(){
  const sel=$('#qo-list .qo-item.sel');if(!sel)return
  closeQuickOpen();openTreeFile(sel.dataset.path,sel.dataset.name)
}

// ── Find ──────────────────────────────────────────────────────────────────────
function openFind() {
  let bar=$('#find-bar')
  if(!bar){
    bar=mk('div','find-bar');bar.id='find-bar'
    bar.innerHTML=`
      <input id="find-in" class="find-in" type="text" placeholder="Find…" autocomplete="off"/>
      <span id="find-cnt" class="find-cnt"></span>
      <button class="find-btn" data-a="find:prev">Up</button>
      <button class="find-btn" data-a="find:next">Down</button>
      <label class="find-chk"><input type="checkbox" id="find-case"/> Aa</label>
      <label class="find-chk"><input type="checkbox" id="find-regex"/> .*</label>
      <button class="find-x" data-a="find:close">x</button>`
    document.body.appendChild(bar)
    const inp=$('#find-in')
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){ e.preventDefault(); findStep(e.shiftKey?-1:1) }
      if(e.key==='Escape'){ e.preventDefault(); closeFind() }
    })
  }
  bar.classList.remove('hidden')
  setTimeout(()=>{const i=$('#find-in');if(i){i.focus();i.select()}},30)
}

function closeFind(){ $('#find-bar')?.classList.add('hidden') }

function doFind() {
  const q=$('#find-in')?.value||''
  const cs=$('#find-case')?.checked||false
  const rx=$('#find-regex')?.checked||false
  const tab=activeTab();if(!tab||!q){const c=$('#find-cnt');if(c)c.textContent='';return}
  S.findMatches=[];S.findIdx=0
  try{
    const flags=cs?'g':'gi'
    const re=rx?new RegExp(q,flags):new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),flags)
    let m;while((m=re.exec(tab.content))!==null)S.findMatches.push(m.index)
  }catch(e){}
  const c=$('#find-cnt');if(c)c.textContent=S.findMatches.length?`1/${S.findMatches.length}`:q?'0/0':''
  if(S.findMatches.length)findStep(0)
}

function findStep(dir){
  if(!S.findMatches.length)return
  if(dir!==0)S.findIdx=(S.findIdx+dir+S.findMatches.length)%S.findMatches.length
  const ta=$('#editor-ta');if(!ta)return
  const pos=S.findMatches[S.findIdx]
  const q=$('#find-in')?.value||''
  ta.focus();ta.setSelectionRange(pos,pos+q.length)
  scrollToLine(ta,pos)
  const c=$('#find-cnt');if(c)c.textContent=`${S.findIdx+1}/${S.findMatches.length}`
}

// ── Drag resize ───────────────────────────────────────────────────────────────
function onDrag(e) {
  if(!S.drag) return
  if(S.drag==='sb'){
    const r=$('#ide')?.getBoundingClientRect();if(!r)return
    const w=Math.max(180,Math.min(560,e.clientX-r.left))
    S.sbW=w;const sb=$('#sidebar');if(sb)sb.style.width=w+'px'
  }
  if(S.drag==='term'){
    const col=$('.editor-col')?.getBoundingClientRect();if(!col)return
    const h=Math.max(100,Math.min(700,col.bottom-e.clientY))
    S.termH=h;const p=$('#term-panel');if(p)p.style.height=h+'px'
  }
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function adjustFontSize(delta) {
  if (delta === 0) {
    _fontSize = 13
  } else {
    _fontSize = Math.max(10, Math.min(22, _fontSize + delta))
  }
  localStorage.setItem('ferrum-fontsize', _fontSize)
  applyFontSize(_fontSize)
}
function applyFontSize(sz) {
  const root = document.documentElement
  root.style.setProperty('--fs-editor', sz + 'px')
  root.style.setProperty('--lh', Math.round(sz * 1.7) + 'px')
  // Resize textarea and gutter to match new line height
  const tab = activeTab()
  if (tab) { _lineCache.length = 0; redrawHL(); redrawGutter(); resizeTextarea(tab) }
  // Show badge
  let badge = document.getElementById('font-badge')
  if (!badge) {
    badge = document.createElement('div')
    badge.id = 'font-badge'
    badge.className = 'font-badge'
    document.body.appendChild(badge)
  }
  badge.textContent = sz + 'px'
  badge.classList.add('visible')
  clearTimeout(badge._t)
  badge._t = setTimeout(() => badge.classList.remove('visible'), 1200)
}

function closeAllDialogs(){
  $('#args-dlg')?.classList.add('hidden')
  $('#newitem-dlg')?.classList.add('hidden')
  $('#scaffold-dlg')?.classList.add('hidden')
  $('#saveas-dlg')?.classList.add('hidden')
}

// ── Re-renders ────────────────────────────────────────────────────────────────
function reRenderEditor() {
  _lineCache.length = 0
  S._lastLineCount = 0
  const lang=activeTab()?.lang||'text'
  const lel=$('#sb-lang');if(lel)lel.textContent=lang==='nim'?'Nim':'Text'
  $('#tab-bar')?.replaceWith(buildTabBar())
  $('#editor-area')?.replaceWith(buildEditorArea())
  setTimeout(() => {
    $('#editor-ta')?.focus()
    updateBreadcrumb()
  }, 20)
}

function reRenderSidebar(){ $('#tree-scroll')?.replaceWith(buildTreeView()) }
function reRenderTabBar(){ $('#tab-bar')?.replaceWith(buildTabBar()) }

function updateTabDot(id) {
  const tab=S.tabs.find(t=>t.id===id)
  const lbl=document.querySelector(`.tab[data-id="${id}"] .tab-lbl`)
  if(!lbl||!tab)return
  const diags=S.diagsByFile[tab.path]||[]
  const errs=diags.filter(d=>d.kind==='error').length
  lbl.innerHTML=escH(tab.name)+(tab.dirty?'<span class="dot"></span>':'')+(errs?`<span class="tab-err-badge">${errs}</span>`:'')
}

function activeTab(){ return S.tabs.find(t=>t.id===S.activeTab) }

boot()
