import './style.css'
import { TEMPLATES, buildTemplateDialog, explainError, buildEnhancedProblemItem } from './enhancements.js'

// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO  —  The Zig IDE
// ══════════════════════════════════════════════════════════════════════════════

// ── Wails bridge ──────────────────────────────────────────────────────────────
async function go(method, ...args) {
  const fn = window?.go?.main?.App?.[method]
  if (fn) { try { return await fn(...args) } catch(e) { console.error(method, e); return null } }
  return STUBS[method]?.(...args) ?? null
}
function wOn(ev, fn) { window?.runtime?.EventsOn?.(ev, fn) }

// ── Demo stubs ────────────────────────────────────────────────────────────────
const DEMO = `const std = @import("std");

/// A basic demonstration file for Ferrum Studio.
pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello from Ferrum Studio!\\n", .{});

    const nums = [_]i32{ 1, 2, 3, 4, 5 };
    var sum: i32 = 0;
    for (nums) |n| sum += n;
    try stdout.print("Sum of 1..5 = {d}\\n", .{sum});

    // Uncomment to see error diagnostics:
    // const bad: u32 = "not a number";
}

test "addition is commutative" {
    try std.testing.expect(1 + 2 == 2 + 1);
}

test "subtraction works" {
    try std.testing.expectEqual(@as(i32, 3), 5 - 2);
}

fn factorial(n: u64) u64 {
    return if (n <= 1) 1 else n * factorial(n - 1);
}
`

const STUBS = {
  OpenFolder:      async () => '',
  OpenFile:        async () => null,
  ReadFile:        async () => DEMO,
  WriteFile:       async () => '',
  SaveFileDialog:  async n => '',   // disabled on Windows — use SaveAs instead
  SaveAs:          async (path, content) => { return '' },
  GetFileTree:     async () => ({ name:'ferrum-demo', path:'/demo', isDir:true, ext:'', children:[
    { name:'src', path:'/demo/src', isDir:true, ext:'', children:[
      { name:'main.zig',  path:'/demo/src/main.zig',  isDir:false, ext:'zig' },
      { name:'utils.zig', path:'/demo/src/utils.zig', isDir:false, ext:'zig' },
    ]},
    { name:'build.zig',     path:'/demo/build.zig',     isDir:false, ext:'zig' },
    { name:'build.zig.zon', path:'/demo/build.zig.zon', isDir:false, ext:'zon' },
    { name:'README.md',     path:'/demo/README.md',     isDir:false, ext:'md'  },
  ]}),
  RunZig:          async cmd => { tPrint(`\x1b[2m[preview] zig ${cmd}\x1b[0m\n`); setTimeout(()=>onZigDone(0),400) },
  ZigCheck:        async () => [],
  ZigFmt:          async () => DEMO,
  KillProc:        async () => {},
  GetBuildSteps:   async () => ([
    { name:'install', desc:'Build and install', kind:'install' },
    { name:'run',     desc:'Run the app',       kind:'run'     },
    { name:'test',    desc:'Run tests',         kind:'test'    },
  ]),
  GetGitStatus:    async () => ({ hasGit:false, branch:'main', modified:[], added:[], untracked:[], deleted:[] }),
  ScaffoldProject: async () => 'Scaffolded!',
  ZigVersion:      async () => '0.13.0',
  GetZigInfo:      async () => ({ version:'0.13.0', path:'/usr/local/bin/zig', os:'linux', arch:'amd64' }),
  GetPlatform:     async () => 'linux/amd64',
  GetProjectRoot:  async () => '',
  GetZigPath:      async () => '/usr/local/bin/zig',
  CreateFile:      async () => '',
  CreateDir:       async () => '',
  DeletePath:      async () => '',
  RenamePath:        async () => '',
  SendInput:         async (text) => {},
  SetZigPath:        async (p) => 'stub',
  BrowseForZig:      async () => '',
  RetryZigDetection: async () => ({ version:'0.13.0', path:'zig', os:'windows', arch:'amd64' }),
}

// ── Syntax highlighter ────────────────────────────────────────────────────────
const ZIG_KW = new Set([
  'addrspace','align','allowzero','and','anyframe','anytype','asm','async','await',
  'break','callconv','catch','comptime','const','continue','defer','else','enum',
  'errdefer','error','export','extern','fn','for','if','inline','linksection',
  'noalias','noinline','nosuspend','opaque','or','orelse','packed','pub','resume',
  'return','struct','suspend','switch','test','threadlocal','try','union',
  'unreachable','usingnamespace','var','volatile','while',
])
const ZIG_TY = new Set([
  'bool','void','noreturn','type','anyerror','comptime_int','comptime_float',
  'i8','i16','i32','i64','i128','i256','isize',
  'u8','u16','u32','u64','u128','u256','usize',
  'f16','f32','f64','f80','f128',
  'c_char','c_short','c_ushort','c_int','c_uint','c_long','c_ulong',
  'c_longlong','c_ulonglong','c_longdouble',
  'true','false','undefined','null','std',
])

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

function hlLine(raw, depthIn) {
  let out = '', i = 0, n = raw.length
  let depth = depthIn
  const X = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const tok = (cls, val) => { out += `<span class="${cls}">${X(val)}</span>` }
  const brOpen  = new Set(['(','[','{'])
  const brClose = new Set([')',']','}'])

  while (i < n) {
    const c = raw[i]

    // Doc comment ///
    if (c==='/'&&raw[i+1]==='/'&&raw[i+2]==='/') {
      tok('hdc', raw.slice(i)); break
    }
    // Line comment //
    if (c==='/'&&raw[i+1]==='/') {
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
    // Multiline string \\
    if (c==='\\'&&raw[i+1]==='\\') { tok('hs', raw.slice(i)); break }
    // @builtins
    if (c==='@') {
      if (raw[i+1]==='"') {
        let j=i+2; while(j<n&&raw[j]!=='"')j++
        tok('hb', raw.slice(i,j+1)); i=j+1; continue
      }
      const m=raw.slice(i).match(/^@[a-zA-Z_]\w*/)
      if(m){ tok('hb',m[0]); i+=m[0].length; continue }
    }
    // Numbers
    if (c>='0'&&c<='9') {
      const m=raw.slice(i).match(/^0x[0-9a-fA-F_]+|^0b[01_]+|^0o[0-7_]+|^[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?/)
      if(m){ tok('hn',m[0]); i+=m[0].length; continue }
    }
    // Words
    if ((c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_') {
      let j=i+1; while(j<n&&/\w/.test(raw[j]))j++
      const w=raw.slice(i,j), next=raw[j]
      if      (ZIG_KW.has(w)) tok('hk',w)
      else if (ZIG_TY.has(w)) tok('ht',w)
      else if (/^[A-Z]/.test(w)) tok('hT',w)
      else if (next==='(')    tok('hf',w)
      else                    tok('hi',w)
      i=j; continue
    }
    // Bracket pair colorization
    if (brOpen.has(c)) {
      const col = BR_COLORS[depth % BR_COLORS.length]
      out += `<span class="hbr" style="color:${col}">${X(c)}</span>`
      depth++; i++; continue
    }
    if (brClose.has(c)) {
      depth = Math.max(0, depth-1)
      const col = BR_COLORS[depth % BR_COLORS.length]
      out += `<span class="hbr" style="color:${col}">${X(c)}</span>`
      i++; continue
    }
    // Operators & punctuation
    if (/[+\-*%=<>!&|^~?:;,.]/.test(c)) tok('hop',c)
    else tok('hp',c)
    i++
  }
  return [out || ' ', depth]
}

// ── Zig snippets ──────────────────────────────────────────────────────────────
const SNIPPETS = [
  // [trigger, display, body]  $0 = cursor  $1,$2 = tab stops (simplified)
  ['fn',        'fn name(args) Type {}',      'fn $1($2) $3 {\n    $0\n}'],
  ['pfn',       'pub fn name(args) Type {}',  'pub fn $1($2) $3 {\n    $0\n}'],
  ['main',      'pub fn main() !void {}',      'pub fn main() !void {\n    $0\n}'],
  ['struct',    'const X = struct {}',         'const $1 = struct {\n    $0\n};'],
  ['enum',      'const X = enum {}',           'const $1 = enum {\n    $0\n};'],
  ['union',     'const X = union(enum) {}',    'const $1 = union(enum) {\n    $0\n};'],
  ['test',      'test "name" {}',              'test "$1" {\n    $0\n}'],
  ['if',        'if (cond) {}',                'if ($1) {\n    $0\n}'],
  ['ife',       'if (cond) {} else {}',        'if ($1) {\n    $0\n} else {\n    \n}'],
  ['for',       'for (iter) |it| {}',          'for ($1) |$2| {\n    $0\n}'],
  ['while',     'while (cond) {}',             'while ($1) {\n    $0\n}'],
  ['whi',       'while (cond) : (inc) {}',     'while ($1) : ($2) {\n    $0\n}'],
  ['sw',        'switch (val) { else => {} }', 'switch ($1) {\n    $2 => $3,\n    else => $0,\n}'],
  ['defer',     'defer stmt;',                 'defer $0;'],
  ['errd',      'errdefer stmt;',              'errdefer $0;'],
  ['std',       'const std = @import("std");', 'const std = @import("std");$0'],
  ['imp',       '@import("name")',             '@import("$1")$0'],
  ['print',     'std.debug.print(...)',        'std.debug.print("$1\\n", .{$2});$0'],
  ['wprint',    'writer.print(...)',           'try writer.print("$1\\n", .{$2});$0'],
  ['alloc',     'page_allocator',              'const allocator = std.heap.page_allocator;\n$0'],
  ['gpa',       'GeneralPurposeAllocator',     'var gpa = std.heap.GeneralPurposeAllocator(.{}){};\ndefer _ = gpa.deinit();\nconst allocator = gpa.allocator();\n$0'],
  ['al',        'ArrayList(T)',                'var $1 = std.ArrayList($2).init(allocator);\ndefer $1.deinit();\n$0'],
  ['hm',        'StringHashMap(T)',            'var $1 = std.StringHashMap($2).init(allocator);\ndefer $1.deinit();\n$0'],
  ['try',       'try expr',                   'try $0'],
  ['catch',     'catch |err| {}',             'catch |err| {\n    $0\n}'],
  ['orelse',    'orelse expr',                'orelse $0'],
  ['comp',      'comptime {}',                'comptime {\n    $0\n}'],
  ['expect',    'std.testing.expect(...)',     'try std.testing.expect($0);'],
  ['expeq',     'std.testing.expectEqual(...)', 'try std.testing.expectEqual($1, $0);'],
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
// ── IntelliSense completion database ─────────────────────────────────────────
// dot-chain aware: items with '.' only appear after typing that prefix
const COMPLETE_ITEMS = [
  // ── std top-level ──────────────────────────────────────────────────────────
  { label:'std',                  detail:'The Zig standard library',                      kind:'module' },
  // ── std sub-modules ────────────────────────────────────────────────────────
  { label:'std.io',               detail:'I/O — getStdOut(), getStdIn(), Reader, Writer', kind:'module' },
  { label:'std.fs',               detail:'Filesystem — openFile(), Dir, File',            kind:'module' },
  { label:'std.mem',              detail:'Memory — Allocator, alloc(), free(), eql()',    kind:'module' },
  { label:'std.fmt',              detail:'Format — allocPrint(), bufPrint(), parseInt()', kind:'module' },
  { label:'std.math',             detail:'Math — sqrt(), sin(), cos(), abs(), max()',     kind:'module' },
  { label:'std.testing',          detail:'Testing — expect(), expectEqual()',             kind:'module' },
  { label:'std.debug',            detail:'Debug — print(), assert(), panic()',            kind:'module' },
  { label:'std.time',             detail:'Time — milliTimestamp(), sleep(), Timer',       kind:'module' },
  { label:'std.process',          detail:'Process — argsAlloc(), exit(), getEnvMap()',    kind:'module' },
  { label:'std.sort',             detail:'Sort — sort(), asc(), desc()',                  kind:'module' },
  { label:'std.unicode',          detail:'Unicode — Utf8View, utf8Encode()',              kind:'module' },
  { label:'std.json',             detail:'JSON — parse(), stringify(), Value',            kind:'module' },
  { label:'std.crypto',           detail:'Crypto — random, hash, sha2, aes',             kind:'module' },
  { label:'std.net',              detail:'Network — tcpConnectToHost(), Address, Stream', kind:'module' },
  { label:'std.compress',         detail:'Compression — gzip, zlib, deflate',            kind:'module' },
  { label:'std.base64',           detail:'Base64 — standard encoder/decoder',            kind:'module' },
  { label:'std.ascii',            detail:'ASCII — isAlpha(), isDigit(), toLower()',       kind:'module' },
  // ── std.heap ───────────────────────────────────────────────────────────────
  { label:'std.heap',                          detail:'Allocators namespace',             kind:'module' },
  { label:'std.heap.page_allocator',           detail:'Simple page allocator (no free tracking)', kind:'field' },
  { label:'std.heap.GeneralPurposeAllocator',  detail:'.init() → detects leaks in Debug mode', kind:'type' },
  { label:'std.heap.ArenaAllocator',           detail:'.init(child) → free all at once',  kind:'type' },
  { label:'std.heap.FixedBufferAllocator',     detail:'.init(buf) → stack-backed allocator', kind:'type' },
  // ── std.io methods ─────────────────────────────────────────────────────────
  { label:'std.io.getStdOut',     detail:'() std.fs.File.Writer',          kind:'fn' },
  { label:'std.io.getStdIn',      detail:'() std.fs.File.Reader',          kind:'fn' },
  { label:'std.io.getStdErr',     detail:'() std.fs.File.Writer',          kind:'fn' },
  // ── std.mem methods ────────────────────────────────────────────────────────
  { label:'std.mem.eql',          detail:'(T, a: []T, b: []T) bool',       kind:'fn' },
  { label:'std.mem.startsWith',   detail:'(T, haystack, needle) bool',     kind:'fn' },
  { label:'std.mem.endsWith',     detail:'(T, haystack, needle) bool',     kind:'fn' },
  { label:'std.mem.indexOf',      detail:'(T, haystack, needle) ?usize',   kind:'fn' },
  { label:'std.mem.split',        detail:'(T, buf, delim) SplitIterator',  kind:'fn' },
  { label:'std.mem.trim',         detail:'(T, slice, values) []T',         kind:'fn' },
  { label:'std.mem.copy',         detail:'(T, dest, src) void',            kind:'fn' },
  { label:'std.mem.zeroes',       detail:'(T) T  — zero-init any type',    kind:'fn' },
  { label:'std.mem.bytesAsSlice', detail:'(T, bytes) []T',                 kind:'fn' },
  // ── std.fmt methods ────────────────────────────────────────────────────────
  { label:'std.fmt.allocPrint',   detail:'(alloc, fmt, args) ![]u8',       kind:'fn' },
  { label:'std.fmt.bufPrint',     detail:'(buf, fmt, args) ![]u8',         kind:'fn' },
  { label:'std.fmt.parseInt',     detail:'(T, str, base) !T',              kind:'fn' },
  { label:'std.fmt.parseFloat',   detail:'(T, str) !T',                    kind:'fn' },
  { label:'std.fmt.format',       detail:'(writer, fmt, args) !void',      kind:'fn' },
  // ── std.testing ────────────────────────────────────────────────────────────
  { label:'std.testing.expect',         detail:'(ok: bool) !void',                  kind:'fn' },
  { label:'std.testing.expectEqual',    detail:'(expected, actual) !void',          kind:'fn' },
  { label:'std.testing.expectError',    detail:'(err, expr) !void',                 kind:'fn' },
  { label:'std.testing.expectEqualSlices', detail:'(T, exp, act) !void',            kind:'fn' },
  { label:'std.testing.expectEqualStrings', detail:'(exp, act) !void',              kind:'fn' },
  { label:'std.testing.allocator',      detail:'std.mem.Allocator — test allocator', kind:'field' },
  // ── std.debug ──────────────────────────────────────────────────────────────
  { label:'std.debug.print',      detail:'(fmt, args) void',               kind:'fn' },
  { label:'std.debug.assert',     detail:'(ok: bool) void',                kind:'fn' },
  { label:'std.debug.panic',      detail:'(fmt, args) noreturn',           kind:'fn' },
  // ── std.math ───────────────────────────────────────────────────────────────
  { label:'std.math.sqrt',        detail:'(x: f64) f64',                   kind:'fn' },
  { label:'std.math.abs',         detail:'(x: T) T',                       kind:'fn' },
  { label:'std.math.max',         detail:'(a: T, b: T) T',                 kind:'fn' },
  { label:'std.math.min',         detail:'(a: T, b: T) T',                 kind:'fn' },
  { label:'std.math.maxInt',      detail:'(T) comptime_int',               kind:'fn' },
  { label:'std.math.minInt',      detail:'(T) comptime_int',               kind:'fn' },
  { label:'std.math.inf',         detail:'comptime_float — positive infinity', kind:'field' },
  { label:'std.math.nan',         detail:'comptime_float — NaN',           kind:'field' },
  { label:'std.math.pi',          detail:'3.14159... comptime_float',      kind:'field' },
  // ── std collections ────────────────────────────────────────────────────────
  { label:'std.ArrayList',        detail:'(T) — dynamic array; .init(alloc)', kind:'type' },
  { label:'std.ArrayListUnmanaged', detail:'(T) — ArrayList without stored allocator', kind:'type' },
  { label:'std.HashMap',          detail:'(K,V,ctx,maxLoad) — hash map',   kind:'type' },
  { label:'std.StringHashMap',    detail:'(V) — string-keyed hash map',    kind:'type' },
  { label:'std.AutoHashMap',      detail:'(K,V) — auto-hashed keys',       kind:'type' },
  { label:'std.BufMap',           detail:'string→string map, owns values', kind:'type' },
  { label:'std.PriorityQueue',    detail:'(T,ctx,cmp) — min/max heap',     kind:'type' },
  // ── @builtins ──────────────────────────────────────────────────────────────
  { label:'@import',         detail:'(path: []const u8) type',             kind:'builtin' },
  { label:'@TypeOf',         detail:'(expr) type  — comptime type of expr',kind:'builtin' },
  { label:'@sizeOf',         detail:'(T) comptime_int  — bytes',           kind:'builtin' },
  { label:'@bitSizeOf',      detail:'(T) comptime_int  — bits',            kind:'builtin' },
  { label:'@alignOf',        detail:'(T) comptime_int  — alignment',       kind:'builtin' },
  { label:'@offsetOf',       detail:'(T, field) comptime_int',             kind:'builtin' },
  { label:'@intCast',        detail:'(x) T  — asserts no truncation',      kind:'builtin' },
  { label:'@floatCast',      detail:'(x) T  — narrowing float cast',       kind:'builtin' },
  { label:'@ptrCast',        detail:'(ptr) *T  — reinterpret pointer',     kind:'builtin' },
  { label:'@as',             detail:'(T, x) T  — type coercion',           kind:'builtin' },
  { label:'@truncate',       detail:'(x) T  — truncate integer',           kind:'builtin' },
  { label:'@intFromFloat',   detail:'(x) T  — float→int',                  kind:'builtin' },
  { label:'@floatFromInt',   detail:'(x) T  — int→float',                  kind:'builtin' },
  { label:'@intFromEnum',    detail:'(e) T  — enum→int',                   kind:'builtin' },
  { label:'@enumFromInt',    detail:'(n) T  — int→enum',                   kind:'builtin' },
  { label:'@intFromBool',    detail:'(b) u1  — bool→int',                  kind:'builtin' },
  { label:'@intFromPtr',     detail:'(p) usize  — pointer→int',            kind:'builtin' },
  { label:'@ptrFromInt',     detail:'(n) *T  — int→pointer',               kind:'builtin' },
  { label:'@fieldParentPtr', detail:'(field_ptr) *Parent  — field offset', kind:'builtin' },
  { label:'@panic',          detail:'(msg: []const u8) noreturn',           kind:'builtin' },
  { label:'@compileError',   detail:'(msg: []const u8)  — CT error',       kind:'builtin' },
  { label:'@compileLog',     detail:'(val)  — print at compile time',      kind:'builtin' },
  { label:'@embedFile',      detail:'(path) []const u8  — embed at CT',    kind:'builtin' },
  { label:'@hasField',       detail:'(T, name) bool  — CT field check',    kind:'builtin' },
  { label:'@hasDecl',        detail:'(T, name) bool  — CT decl check',     kind:'builtin' },
  { label:'@field',          detail:'(obj, name) T  — runtime field by name', kind:'builtin' },
  { label:'@tagName',        detail:'(enum_val) []const u8  — enum→str',   kind:'builtin' },
  { label:'@typeName',       detail:'(T) []const u8  — type→str at CT',    kind:'builtin' },
  { label:'@typeInfo',       detail:'(T) std.builtin.Type  — reflect type',kind:'builtin' },
  { label:'@Vector',         detail:'(len, T) SIMD vector type',           kind:'builtin' },
  { label:'@memcpy',         detail:'(dest, src) void  — copy memory',     kind:'builtin' },
  { label:'@memset',         detail:'(buf, val) void  — fill memory',      kind:'builtin' },
  { label:'@min',            detail:'(a, b) T  — comptime min',            kind:'builtin' },
  { label:'@max',            detail:'(a, b) T  — comptime max',            kind:'builtin' },
  { label:'@abs',            detail:'(x) T  — absolute value',             kind:'builtin' },
  { label:'@sqrt',           detail:'(x) T  — square root',                kind:'builtin' },
  { label:'@sin',            detail:'(x) T  — sine',                       kind:'builtin' },
  { label:'@cos',            detail:'(x) T  — cosine',                     kind:'builtin' },
  { label:'@log',            detail:'(x) T  — natural log',                kind:'builtin' },
  { label:'@exp',            detail:'(x) T  — e^x',                        kind:'builtin' },
  { label:'@call',           detail:'(modifier, fn, args)',                 kind:'builtin' },
  { label:'@frame',          detail:'() anyframe  — current async frame',  kind:'builtin' },
  { label:'@setRuntimeSafety', detail:'(enabled: bool)  — toggle safety',  kind:'builtin' },
  { label:'@setCold',        detail:'(val: bool)  — hint cold path',       kind:'builtin' },
  // ── keywords (also in ZIG_KW but shown with detail in AC) ─────────────────
  ...Array.from(ZIG_KW).map(k => ({ label:k, detail:'Zig keyword',   kind:'keyword' })),
  // ── built-in types ─────────────────────────────────────────────────────────
  ...Array.from(ZIG_TY).map(t => ({ label:t, detail:'Built-in type', kind:'type' })),
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

  // Trigger on 2+ chars, or on 1 char if it's @ (builtins)
  if (word.length < 2 || (word.length < 2 && !word.startsWith('@'))) {
    acClose(); return
  }

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

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  tabs: [], activeTab: null,
  tree: null, expanded: new Set(),
  sbW: 240, termH: 250, drag: null,
  zigInfo: { version:'…', path:'', os:'', arch:'' },
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
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
function mk(t,c){ const e=document.createElement(t); if(c)e.className=c; return e }
function mkt(t,c,tx){ const e=mk(t,c); e.textContent=tx; return e }
function escH(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function bn(p){ return (p||'').replace(/\\/g,'/').split('/').pop() }
function langOf(p){ return (p||'').endsWith('.zig')?'zig':'text' }
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



// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  S.tabs.push({ id:'demo', path:null, name:'main.zig', content:DEMO, dirty:false, lang:'zig' })
  S.activeTab = 'demo'
  buildApp()
  wireAll()
  tPrint('\x1b[33m  ⬡ Ferrum Studio\x1b[0m\x1b[2m — The Zig IDE\x1b[0m\n')
  tPrint('\x1b[2m  F5=Run  F6=Run+args  F7=Build  F8=Test  Ctrl+S=Save+Check  Ctrl+P=Quick Open\x1b[0m\n\n')
  // Async init
  go('GetZigInfo').then(info => {
    if (!info) return
    S.zigInfo = info
    updateZigBadge(info)
  })
  go('GetBuildSteps').then(steps => { if(steps) S.buildSteps = steps; renderBuildPanel() })
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
  ;[['File','m:file'],['Edit','m:edit'],['Run','m:run'],['Zig','m:zig'],['View','m:view']].forEach(([l,a])=>{
    const b = mkt('button','menu-btn',l); b.dataset.a=a; menu.appendChild(b)
  })

  const acts = mk('div','tb-acts')
  acts.innerHTML = `
    <button class="tbtn run-btn" data-a="z:run"      title="Run (F5)">▶ Run</button>
    <button class="tbtn"         data-a="z:run-args"  title="Run with args (F6)">▶ …</button>
    <button class="tbtn"         data-a="z:build"     title="zig build (F7)">⚙ Build</button>
    <button class="tbtn"         data-a="z:test"      title="zig test (F8)">✦ Test</button>
    <button class="tbtn"         data-a="z:fmt"       title="Format (Ctrl+Shift+F)">⟳ Fmt</button>
    <button class="tbtn"         data-a="z:check"     title="Check (Ctrl+Shift+C)">✓ Check</button>
    <button class="tbtn kill-btn hidden" id="kill-btn" data-a="z:kill">■ Stop</button>`

  const info = mk('div','tb-info')
  info.innerHTML = `
    <span id="zig-badge" title="Zig version">zig ${S.zigInfo.version}</span>
    <span id="plat-badge">${S.zigInfo.os}</span>`

  bar.append(logo, menu, acts, info)
  return bar
}

// ── Main area ─────────────────────────────────────────────────────────────────
function buildMainArea() {
  const main = mk('div','main-area')
  const rv = mk('div','resize-v'); rv.dataset.drag='sb'
  const col = mk('div','editor-col')
  col.append(buildTabBar(), buildEditorArea(), buildResizeH(), buildBottomPanel())
  main.append(buildSidebar(), rv, col)
  return main
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
    <button class="act-btn" data-pnl="ai" title="AI Assistant (Gemini)">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2C5.13 2 2 5.13 2 9s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7z" stroke="currentColor" stroke-width="1.3"/>
        <path d="M9 5v4l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="9" cy="9" r="1.2" fill="currentColor"/>
        <path d="M6 13.5C6.8 14.4 7.8 15 9 15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
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

  content.append(explorer, buildPanel, snipPanel)
  sb.append(act, content)
  return sb
}

function buildTreeView() {
  const wrap = mk('div','tree-scroll'); wrap.id='tree-scroll'
  if (!S.tree) {
    const empty = mk('div','tree-empty')
    empty.innerHTML = `
      <div class="empty-icon">◈</div>
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
    row.innerHTML = `<span class="caret">${open?'▾':'▸'}</span><span class="tree-ico">${open?'📂':'📁'}</span><span class="tree-lbl">${escH(node.name)}</span>${gitMark}`
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
    zig:['ico-zig','z'], md:['ico-md','m'], json:['ico-js','{}'],
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
  refreshBtn.textContent='↺'; hdr.appendChild(refreshBtn)
  wrap.appendChild(hdr)

  const list = mk('div','build-list'); list.id='build-list'

  const noBuild = !S.tree
  if (noBuild) {
    list.innerHTML = '<div class="ref-empty">Open a project folder with build.zig</div>'
  } else if (!S.buildSteps.length) {
    list.innerHTML = '<div class="ref-empty">No build steps found</div>'
  } else {
    S.buildSteps.forEach(step => {
      const row = mk('div','build-step-row')
      row.dataset.a = 'build:step'; row.dataset.name = step.name
      const iconMap = { test:'✦', run:'▶', install:'⬇', clean:'🗑', build:'⚙' }
      const icon = iconMap[step.kind] || '⚙'
      row.innerHTML = `
        <span class="build-step-icon ${step.kind}">${icon}</span>
        <div class="build-step-info">
          <span class="build-step-name">${escH(step.name)}</span>
          <span class="build-step-desc">${escH(step.desc)}</span>
        </div>
        <button class="build-step-run" data-a="build:step" data-name="${escH(step.name)}" title="Run this step">▶</button>`
      list.appendChild(row)
    })
  }

  // New project button
  const foot = mk('div','build-footer')
  const scaffoldBtn = mkt('button','wbtn small','⬡  New Zig Project')
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
  sHdr.textContent = '▸ Snippets  (type + Tab)'
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
    ['std.io', 'getStdOut(), getStdIn(), Writer, Reader, AnyWriter'],
    ['std.fs', 'cwd(), openFile(), createFile(), Dir.walk()'],
    ['std.mem', 'alloc(), free(), copy(), eql(), split(), Allocator'],
    ['std.fmt', 'allocPrint(), bufPrint(), parseInt(), format()'],
    ['std.math', 'sqrt(), sin(), cos(), abs(), max(), min(), inf, pi'],
    ['std.testing', 'expect(), expectEqual(), expectError(), expectFmt()'],
    ['std.process', 'argsAlloc(), argsFree(), exit(), getEnvMap()'],
    ['std.time', 'milliTimestamp(), nanoTimestamp(), sleep()'],
    ['std.Thread', 'spawn(), join(), Mutex, RwLock, Semaphore'],
    ['std.ArrayList', 'init(), append(), pop(), items, capacity'],
    ['std.HashMap', 'init(), put(), get(), remove(), iterator()'],
    ['std.json', 'parse(), stringify(), Value, parseFromSlice()'],
    ['std.crypto', 'random, hash, aes, sha2, hmac'],
    ['std.net', 'tcpConnectToHost(), Address, Stream'],
    ['std.sort', 'sort(), pdq(), asc(), desc()'],
    ['std.unicode', 'utf8CountCodepoints(), Utf8View, Utf8Iterator'],
    ['std.debug', 'print(), assert(), panic(), captureStackTrace()'],
  ]
  const rHdr = mk('div','ref-sect-hdr')
  rHdr.textContent = '▸ std library'
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
    ['?T', 'Optional: nullable value, use orelse/if'],
    ['!T', 'Error union: fn returns error or T'],
    ['[]T', 'Slice: fat pointer (ptr + len)'],
    ['[N]T', 'Array: fixed-size, stack allocated'],
    ['[*]T', 'Many-pointer: no length info'],
    ['[:0]u8', 'Sentinel-terminated slice (C string)'],
    ['*T / **T', 'Single / double pointer'],
    ['defer', 'Runs at end of scope (always)'],
    ['errdefer', 'Runs only if function returns error'],
    ['comptime', 'Compile-time execution context'],
    ['inline for', 'Unrolled loop at compile time'],
    ['union(enum)', 'Tagged union (safe sum type)'],
    ['packed struct', 'Bit-exact memory layout'],
    ['extern struct', 'C-compatible memory layout'],
    ['anytype', 'Generic parameter (any type)'],
  ]
  const pHdr = mk('div','ref-sect-hdr')
  pHdr.textContent = '▸ Zig patterns'
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
        <button class="tab-x" data-a="tab:close" data-id="${t.id}" title="Close">✕</button>`
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

  // ── Gutter ────────────────────────────────────────────────────────────────
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
      // Click line number → select the whole line in editor
      const ta = document.getElementById('editor-ta')
      if (!ta) return
      const v = ta.value, lines = v.split('\n')
      let pos = 0
      for (let j = 0; j < lineNo-1; j++) pos += lines[j].length + 1
      const end = pos + (lines[lineNo-1]||'').length
      ta.focus(); ta.setSelectionRange(pos, end)
    })
    if (/{$/.test(lineText.trimEnd()) || /^(pub fn|fn |struct |enum |test |comptime )/.test(lineText.trim())) {
      ln.classList.add('foldable')
      ln.dataset.foldLine = lineNo
    }
    gutter.appendChild(ln)
  })

  // ── Highlight layer ───────────────────────────────────────────────────────
  const hl = mk('div','hl'); hl.id='hl'
  hl.innerHTML = tab.lang==='zig'
    ? hlCodeWithDiags(tab.content, diagByLine)
    : lines.map(l=>'<div class="cl">'+escH(l)+'</div>').join('')

  // ── Squiggle overlay ──────────────────────────────────────────────────────
  const sq = mk('div','squiggle-layer'); sq.id='sq'
  tabDiags.forEach(d => {
    const lineText = lines[d.line-1]||''
    const colStart = Math.max(0, d.col-1)
    const CW = 7.825
    const left = 16 + colStart*CW
    const width = Math.max(CW*3, (lineText.length - colStart)*CW)
    const top = 12 + (d.line-1)*22 + 19
    const s = mk('div', 'sq sq-'+d.kind)
    s.style.cssText = 'left:'+left+'px;top:'+top+'px;width:'+Math.min(width,900)+'px'
    s.title = d.kind+': '+d.message
    sq.appendChild(s)
  })

  // ── Current line highlight ────────────────────────────────────────────────
  const curLine = mk('div','cur-line-hl'); curLine.id='cur-line-hl'
  curLine.style.top = '12px'

  // ── Textarea — NO overflow, sized to content ──────────────────────────────
  const ta = document.createElement('textarea')
  ta.id='editor-ta'; ta.value=tab.content
  ta.spellcheck=false; ta.autocomplete='off'
  ta.setAttribute('autocorrect','off'); ta.setAttribute('autocapitalize','off')
  ta.addEventListener('input',   onEditorInput)
  ta.addEventListener('keydown', onEditorKey)
  ta.addEventListener('click',   onEditorClick)
  ta.addEventListener('keyup',   onEditorClick)
  // NO scroll listener — code-pane scrolls, not textarea

  // ── editor-inner: shared positioning context for all layers ──────────────
  // All children are absolutely positioned inside it.
  // It grows to fit the hl content, which makes code-pane scroll correctly.
  const inner = mk('div','editor-inner'); inner.id='editor-inner'
  inner.append(curLine, hl, sq, ta)

  // ── Code pane is the scroll container ────────────────────────────────────
  const pane = mk('div','code-pane'); pane.id='code-pane'
  pane.addEventListener('scroll', onPaneScroll)
  pane.appendChild(inner)

  area.append(gutter, pane)

  // Size textarea to match hl after first paint
  requestAnimationFrame(function(){ resizeTextarea(tab) })
  return area
}

// Sync gutter scrollTop when code-pane scrolls (gutter is separate from pane)
function onPaneScroll() {
  const pane = document.getElementById('code-pane')
  const gu   = document.getElementById('gutter')
  if (pane && gu) gu.scrollTop = pane.scrollTop
}

// Resize textarea to exactly match the hl layer dimensions so the caret
// position aligns with the syntax-highlighted text at all zoom levels.
function resizeTextarea(tab) {
  const hl    = document.getElementById('hl')
  const ta    = document.getElementById('editor-ta')
  const inner = document.getElementById('editor-inner')
  if (!hl || !ta || !inner) return

  const content = tab?.content || (document.getElementById('editor-ta')?.value || '')
  const lineCount = content.split('\n').length
  const fallbackH = lineCount * 22 + 24

  // Prefer actual scrollHeight once hl has rendered content
  const hlH = hl.scrollHeight > 24 ? hl.scrollHeight : fallbackH
  // For width: find the longest line and estimate its pixel width
  const longestLine = content.split('\n').reduce((a, l) => Math.max(a, l.length), 0)
  const estW = longestLine * 7.5 + 48
  const hlW  = hl.scrollWidth > 100 ? hl.scrollWidth : Math.max(estW, 600)

  // inner div must be at least as tall/wide as content for pane to scroll
  inner.style.minHeight = hlH + 'px'
  inner.style.minWidth  = hlW + 'px'

  // textarea fills the inner div so the caret never runs out of space
  ta.style.width  = hlW + 'px'
  ta.style.height = hlH + 'px'
}

function hlCodeWithDiags(code, diagByLine) {
  const lines = code.split('\n')
  let depth = 0
  return lines.map((line, i) => {
    const [html, newDepth] = hlLine(line, depth)
    depth = newDepth
    const d = diagByLine[i+1]
    const ghost = d ? `<span class="inline-err ie-${d.kind}" title="${escH(d.message)}"> ← ${escH(d.message)}</span>` : ''
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
      <text x="36" y="45" text-anchor="middle" font-size="16" font-family="'Geist Mono',monospace" fill="#f97316" font-weight="700">Fe</text>
    </svg>
    <h1 class="wlc-h1">Ferrum Studio</h1>
    <p class="wlc-sub">The professional IDE built exclusively for Zig</p>
    <div class="wlc-btns">
      <button class="wbtn primary" data-a="open:folder">📂 Open Folder</button>
      <button class="wbtn" data-a="file:new">＋ New File</button>
      <button class="wbtn" data-a="open:file">📄 Open File</button>
      <button class="wbtn" data-a="scaffold:open">⬡ New Zig Project</button>
      <button class="wbtn" data-a="template:open">🧩 From Template</button>
      <button class="wbtn" data-a="do:quickopen">⚡ Quick Open</button>
    </div>
    ${recentFiles.length ? `
    <div class="wlc-recent">
      <div class="wlc-recent-title">Recent files</div>
      ${recentFiles.map(p=>`<div class="wlc-recent-item" data-a="recent:open" data-path="${escH(p)}">${escH(bn(p))}<span class="wlc-recent-path">${escH(p)}</span></div>`).join('')}
    </div>` : ''}
    <div class="wlc-features">
      <div class="wlc-feat"><span class="feat-key">F5</span><span>Run file</span></div>
      <div class="wlc-feat"><span class="feat-key">F6</span><span>Run with args</span></div>
      <div class="wlc-feat"><span class="feat-key">F7</span><span>zig build</span></div>
      <div class="wlc-feat"><span class="feat-key">F8</span><span>zig test</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+S</span><span>Save & Check</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+P</span><span>Quick Open</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+F</span><span>Find in file</span></div>
      <div class="wlc-feat"><span class="feat-key">Ctrl+G</span><span>Go to line</span></div>
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
      ⚠ Problems<span id="prob-badge" class="prob-bdg hidden"></span>
    </div>
    <div class="panel-tab ${S.activePanel==='tests'?'active':''}" id="tab-tests" data-a="panel:tests">
      ✦ Tests<span id="test-badge" class="prob-bdg hidden"></span>
    </div>
    <div class="panel-tab ${S.activePanel==='build'?'active':''}" data-a="panel:build">
      ⚙ Build Output
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
  const ps = mkt('span','term-ps','➜'); ps.id='term-ps'
  const inp = document.createElement('input')
  inp.type='text'; inp.id='term-in'; inp.autocomplete='off'; inp.spellcheck=false
  inp.placeholder='zig run src/main.zig -- ./mydir   |   type help'
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
    list.innerHTML = '<div class="prob-empty">✓ No problems detected</div>'
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
  const runBtn = mkt('button','wbtn small','✦ Run Tests')
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
    <span class="ts-pass">✓ ${passed} passed</span>
    ${failed?`<span class="ts-fail">✕ ${failed} failed</span>`:''}
    <span class="ts-total">${S.testResults.length} total</span>`
  list.appendChild(summary)
  S.testResults.forEach(t => {
    const row = mk('div', `test-row ${t.status}`)
    row.innerHTML = `
      <span class="test-icon">${t.status==='pass'?'✓':'✕'}</span>
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
      <span id="sb-branch">⎇ ${S.gitStatus.branch||'main'}</span>
      <span id="sb-run-ind" class="hidden">⟳ running</span>
    </div>
    <div id="sb-r">
      <span id="sb-diag-err" class="sb-diag sb-err hidden"></span>
      <span id="sb-diag-warn" class="sb-diag sb-warn hidden"></span>
      <span id="sb-pos">Ln 1, Col 1</span>
      <span id="sb-lang">Zig</span>
      <span id="sb-enc">UTF-8</span>
      <span id="sb-zig" title="Zig path">zig ${S.zigInfo.version}</span>
    </div>`
  return bar
}

function updateDiagStatus(errs, warns) {
  const ee = $('#sb-diag-err'), ew = $('#sb-diag-warn')
  if (ee) { if(errs){ee.textContent=`✕ ${errs}`;ee.classList.remove('hidden')}else ee.classList.add('hidden') }
  if (ew) { if(warns){ew.textContent=`⚠ ${warns}`;ew.classList.remove('hidden')}else ew.classList.add('hidden') }
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function buildArgsDialog() {
  const dlg = mk('div','dialog-bg hidden'); dlg.id='args-dlg'
  dlg.innerHTML = `<div class="dialog">
    <div class="dlg-title">Run with arguments</div>
    <div class="dlg-body">
      <div class="dlg-hint">Arguments passed after <code>--</code> to your program</div>
      <div class="dlg-row">
        <span class="dlg-pre" id="args-prefix">zig run &lt;file&gt; -- </span>
        <input id="args-in" class="dlg-input" type="text" placeholder="./mydir  or  arg1 arg2" autocomplete="off"/>
      </div>
    </div>
    <div class="dlg-footer">
      <button class="wbtn" data-a="dlg:cancel">Cancel</button>
      <button class="wbtn primary" data-a="dlg:run">▶ Run</button>
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
        <input id="newitem-in" class="dlg-input" type="text" placeholder="main.zig" autocomplete="off"/>
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
    <div class="dlg-title">New Zig Project</div>
    <div class="dlg-body">
      <div class="dlg-hint">Creates a new Zig project using <code>zig init</code></div>
      <div class="dlg-row">
        <span class="dlg-pre">Directory:</span>
        <input id="scaffold-dir" class="dlg-input" type="text" placeholder="/home/user/my-project" autocomplete="off"/>
      </div>
    </div>
    <div class="dlg-footer">
      <button class="wbtn" data-a="scaffold:cancel">Cancel</button>
      <button class="wbtn primary" data-a="scaffold:create">⬡ Create</button>
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
  wOn('zig:out',   data => tPrint(data))

  // Listen for template application from enhancements.js
  window.addEventListener('ferrum:template-applied', async e => {
    const { files, root } = e.detail
    // Refresh tree
    S.tree = await go('GetFileTree', root)
    reRenderSidebar()
    // Open the first .zig file
    const mainFile = files.find(f => f.name.endsWith('.zig'))
    if (mainFile) {
      await addTab(mainFile.path, mainFile.name, mainFile.content, 'zig')
    }
    tLine('Template applied! Files created in ' + root, '#4ade80')
  })
  wOn('zig:done',  code => onZigDone(code))
  wOn('zig:diags', diags => applyDiags(diags))
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
  if (mod&&e.key==='n')             { e.preventDefault(); cmdNewFile(); return }
  if (mod&&e.key==='o')             { e.preventDefault(); cmdOpenFile(); return }
  if (mod&&e.key==='w')             { e.preventDefault(); closeActiveTab(); return }
  if (e.key==='F5')                 { e.preventDefault(); cmdRun(); return }
  if (e.key==='F6')                 { e.preventDefault(); showArgsDialog(); return }
  if (e.key==='F7')                 { e.preventDefault(); cmdBuild(); return }
  if (e.key==='F8')                 { e.preventDefault(); cmdTest(); return }
  if (e.key==='Escape')             { closeAllDialogs(); closeFind(); closeQuickOpen(); return }
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
    case 'ref:toggle':    { const s=$('#sect-'+el.dataset.sect); if(s){const open=!s.classList.contains('hidden');s.classList.toggle('hidden',open);el.textContent=(open?'▸':'▾')+el.textContent.slice(1)} break }
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
      ['New Zig Project', 'scaffold:open'],
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
    case 'm:zig': showMenu(el,[
      ['zig build',                  'zig:build'],
      ['zig build-exe',              'zig:build-exe'],
      ['zig build-lib',              'zig:build-lib'],
      ['zig init (new project)',     'scaffold:open'],
      null,
      ['zig env',                    'zig:env'],
      ['zig targets',                'zig:targets'],
      ['zig version',                'zig:version'],
      null,
      ['Show zig path',              'zig:which'],
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
    case 'do:gotoline': openGotoLine(); break
    case 'zig:build':    runZig('build'); break
    case 'zig:build-exe':{ const t=activeTab(); if(t?.path)runZig(`build-exe ${t.path}`); break }
    case 'zig:build-lib':{ const t=activeTab(); if(t?.path)runZig(`build-lib ${t.path}`); break }
    case 'zig:env':      runZig('env'); break
    case 'zig:targets':  runZig('targets'); break
    case 'zig:version':  go('ZigVersion').then(v=>tPrint((v||'?')+'\n')); break
    case 'zig:which':    tPrint('zig: '+S.zigInfo.path+'\n'); break
  }
}

// ── Editor handlers ───────────────────────────────────────────────────────────
function onEditorInput(e) {
  const ta = e.target
  const tab = activeTab(); if (!tab) return
  tab.content = ta.value; tab.dirty = true

  updateCursorPos(ta)
  updateTabDot(tab.id)

  // Debounced highlight + gutter + textarea resize
  clearTimeout(S._hlTimer)
  S._hlTimer = setTimeout(function() {
    redrawHL()
    var lc = tab.content.split('\n').length
    if (lc !== S._lastLineCount) { S._lastLineCount = lc; redrawGutter() }
    // Resize textarea so code-pane scrolls to fit new content
    resizeTextarea(tab)
  }, 50)

  clearTimeout(S._acTimer)
  S._acTimer = setTimeout(function() { acUpdate(ta) }, 180)

  if (tab.path) {
    clearTimeout(S.checkTimer)
    S.checkTimer = setTimeout(function() { autoCheck(tab) }, 2500)
  }
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
  const diags = await go('ZigCheck', tab.path)
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

  // Ctrl+D — select next occurrence
  if ((e.ctrlKey||e.metaKey)&&e.key==='d') { e.preventDefault(); selectNext(ta); return }
  if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); cmdSaveAndCheck(); return }
  if ((e.ctrlKey||e.metaKey)&&e.key==='/')  { e.preventDefault(); toggleComment(); return }
}

// onEditorScroll is kept for compatibility but the textarea no longer scrolls.
// Scrolling is handled by code-pane (onPaneScroll).
function onEditorScroll() {}

function onEditorClick(e) {
  const ta = e.target?.id === 'editor-ta' ? e.target : $('#editor-ta')
  updateCursorPos(ta)
}

// Line cache: stores the last-rendered HTML for each line index
// so we only update DOM nodes whose source line actually changed
const _lineCache = []

function redrawHL() {
  const hl = document.getElementById('hl')
  const tab = activeTab()
  if (!hl || !tab) return

  const tabDiags = S.diagsByFile[tab.path] || []
  const diagByLine = {}
  tabDiags.forEach(d => { if (!diagByLine[d.line]) diagByLine[d.line] = d })

  const lines = tab.content.split('\n')
  const isZig = tab.lang === 'zig'
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
        ? '<span class="inline-err ie-' + diag.kind + '" title="' + escH(diag.message) + '"> ← ' + escH(diag.message) + '</span>'
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
  if (trimmed.startsWith('// ')) {
    newLine = indent+trimmed.slice(3); offset=-3
  } else if (trimmed.startsWith('//')) {
    newLine = indent+trimmed.slice(2); offset=-2
  } else {
    newLine = indent+'// '+trimmed; offset=3
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
    if(l<r)ta.setSelectionRange(l,r); return
  }
  const next = v.indexOf(word,en)
  if (next!==-1) { ta.setSelectionRange(next,next+word.length); scrollToLine(ta,next) }
  else { const first=v.indexOf(word); if(first!==-1)ta.setSelectionRange(first,first+word.length) }
}

function scrollToLine(ta, pos) {
  const line = ta.value.slice(0,pos).split('\n').length-1
  ta.scrollTop = Math.max(0,(line-5)*22)
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
function runZig(argsStr) {
  if (S.running) { tLine('Already running. Press Ctrl+C or Stop.','#fbbf24'); return }
  setRunning(true)
  _ts.t = Date.now()
  tLine('\n$ zig '+argsStr.trim(), '#60a5fa')
  switchPanel('terminal')
  go('RunZig', argsStr.trim())
}

function runBuildStep(name) {
  tLine(`\n$ zig build ${name}`, '#60a5fa')
  switchPanel('build')
  go('RunZig', `build ${name}`)
  setRunning(true)
  _ts.t = Date.now()
}

function onZigDone(code) {
  setRunning(false)
  const elapsed = _ts.t ? ` (${((Date.now()-_ts.t)/1000).toFixed(2)}s)` : ''
  tLine(code===0 ? `─── ✓ exit 0${elapsed} ───` : `─── ✕ exit ${code}${elapsed} ───`,
        code===0 ? '#4ade80' : '#f87171')
  tLine('')
  // Refresh git status after build
  go('GetGitStatus').then(gs => { if(gs) { S.gitStatus=gs; updateGitUI() } })
}

function updateZigBadge(info) {
  const b = $('#zig-badge')
  const p = $('#plat-badge')
  const notFound = !info?.version || info.version === 'not found'
  if (b) {
    b.textContent = notFound ? '⚠ zig not found' : 'zig ' + info.version
    b.style.color = notFound ? 'var(--red)' : ''
    b.style.cursor = 'pointer'
    b.title = notFound
      ? 'Zig not found — click to locate or retry detection'
      : 'zig at ' + (info.path || 'zig') + ' — click to change'
    b.onclick = () => showZigSetup()
  }
  if (p) p.textContent = (info?.os || '') + '/' + (info?.arch || '')
  S.zigInfo = info || S.zigInfo
  if (notFound) showZigBanner()
}

function showZigBanner() {
  // Show a dismissible banner at top of editor if zig is not found
  if ($('#zig-banner')) return // already shown
  const banner = mk('div', 'zig-banner')
  banner.id = 'zig-banner'
  banner.innerHTML =
    '<span class="zig-banner-msg">⚠ Zig not found on PATH. ' +
    'If you just installed Zig, click <strong>Retry Detection</strong> ' +
    'or <strong>Browse…</strong> to locate it manually.</span>' +
    '<button class="zig-banner-btn" id="zig-retry-btn">↻ Retry Detection</button>' +
    '<button class="zig-banner-btn" id="zig-browse-btn">📂 Browse…</button>' +
    '<button class="zig-banner-close" id="zig-banner-close">✕</button>'
  // Insert before editor area
  const col = document.querySelector('.editor-col')
  const tabBar = $('#tab-bar')
  if (col && tabBar) col.insertBefore(banner, tabBar)

  document.getElementById('zig-retry-btn')?.addEventListener('click', async () => {
    const info = await go('RetryZigDetection')
    if (info && info.version !== 'not found') {
      $('#zig-banner')?.remove()
      updateZigBadge(info)
      tLine('✓ Zig found: ' + info.version + ' at ' + info.path, '#4ade80')
    } else {
      tLine('Still not found. Try Browse… to locate zig.exe manually.', '#f87171')
    }
  })
  document.getElementById('zig-browse-btn')?.addEventListener('click', async () => {
    const ver = await go('BrowseForZig')
    if (ver && !ver.startsWith('not') && !ver.startsWith('empty') && !ver.startsWith('error')) {
      $('#zig-banner')?.remove()
      const info = await go('GetZigInfo')
      updateZigBadge(info)
      tLine('✓ Zig configured: ' + ver + ' at ' + S.zigInfo.path, '#4ade80')
    } else if (ver) {
      tLine('Error: ' + ver, '#f87171')
    }
  })
  document.getElementById('zig-banner-close')?.addEventListener('click', () => {
    $('#zig-banner')?.remove()
  })
}

function showZigSetup() {
  // Inline settings — show current path and offer retry/browse
  const current = S.zigInfo?.path || 'not found'
  const ver = S.zigInfo?.version || 'not found'

  const dlg = mk('div', 'dialog-bg')
  dlg.id = 'zig-setup-dlg'
  dlg.innerHTML = '<div class="dialog">' +
    '<div class="dlg-title">⬡ Zig Configuration</div>' +
    '<div class="dlg-body" style="gap:12px">' +
      '<div class="dlg-hint">Current zig: <code id="zig-cur-path">' + escH(current) + '</code></div>' +
      '<div class="dlg-hint">Version: <code>' + escH(ver) + '</code></div>' +
      '<div class="dlg-hint" style="margin-top:4px">If you just installed Zig, retry detection first. ' +
      'If detection fails, use Browse to locate <code>zig.exe</code> manually.</div>' +
      '<div class="dlg-row">' +
        '<input id="zig-manual-path" class="dlg-input" type="text" ' +
          'placeholder="C:\\zig-0.14.0\\zig.exe or /usr/local/bin/zig" ' +
          'value="' + (current !== 'not found' ? escH(current) : '') + '" autocomplete="off"/>' +
      '</div>' +
    '</div>' +
    '<div class="dlg-footer">' +
      '<button class="wbtn" id="zig-dlg-cancel">Cancel</button>' +
      '<button class="wbtn" id="zig-dlg-browse">📂 Browse…</button>' +
      '<button class="wbtn" id="zig-dlg-retry">↻ Retry Auto-detect</button>' +
      '<button class="wbtn primary" id="zig-dlg-apply">Apply</button>' +
    '</div>' +
  '</div>'

  document.body.appendChild(dlg)

  document.getElementById('zig-dlg-cancel').addEventListener('click', () => dlg.remove())
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })

  document.getElementById('zig-dlg-retry').addEventListener('click', async () => {
    const info = await go('RetryZigDetection')
    if (info?.version && info.version !== 'not found') {
      dlg.remove(); $('#zig-banner')?.remove()
      updateZigBadge(info)
      tLine('✓ Zig auto-detected: ' + info.version + ' at ' + info.path, '#4ade80')
    } else {
      document.getElementById('zig-cur-path').textContent = 'Still not found — try Browse'
      document.getElementById('zig-cur-path').style.color = 'var(--red)'
    }
  })

  document.getElementById('zig-dlg-browse').addEventListener('click', async () => {
    const ver = await go('BrowseForZig')
    if (ver && !ver.startsWith('not') && !ver.startsWith('empty') && !ver.startsWith('error')) {
      dlg.remove(); $('#zig-banner')?.remove()
      const info = await go('GetZigInfo')
      updateZigBadge(info)
      tLine('✓ Zig set: ' + ver, '#4ade80')
    } else if (ver) {
      tLine('Error: ' + ver, '#f87171')
    }
  })

  document.getElementById('zig-dlg-apply').addEventListener('click', async () => {
    const p = (document.getElementById('zig-manual-path')?.value || '').trim()
    if (!p) return
    const result = await go('SetZigPath', p)
    if (result && !result.startsWith('not') && !result.startsWith('empty') && !result.startsWith('error')) {
      dlg.remove(); $('#zig-banner')?.remove()
      const info = await go('GetZigInfo')
      updateZigBadge(info)
      tLine('✓ Zig set to ' + p + ' (version: ' + result + ')', '#4ade80')
    } else {
      tLine('Failed: ' + (result || 'unknown error') + ' — check the path is correct', '#f87171')
    }
  })
}

function updateGitUI() {
  const b = $('#sb-branch')
  if (b) b.textContent = '⎇ ' + (S.gitStatus.branch||'main')
  if (S.tree) reRenderSidebar() // refresh git markers
}

function setRunning(v) {
  S.running = v
  $('#kill-btn')?.classList.toggle('hidden', !v)
  $('#sb-run-ind')?.classList.toggle('hidden', !v)

  // Update terminal prompt: ➜ when idle, > when process is running
  const ps  = document.getElementById('term-ps')
  const inp = document.getElementById('term-in')
  if (ps) {
    ps.textContent = v ? '>' : '➜'
    ps.style.color = v ? '#4ade80' : ''
    ps.title = v ? 'Process running — type input here and press Enter to send' : ''
  }
  if (inp) {
    inp.placeholder = v
      ? 'Type program input, press Enter to send  (Ctrl+C to kill)'
      : 'zig run … | build | test | help'
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
  tLine('\n➜ ' + raw, '#7070a0')
  await handleTermCmd(raw)
}

async function handleTermCmd(raw) {
  const p=raw.trim().split(/\s+/), cmd=p[0], tab=activeTab()
  if(cmd==='clear'||cmd==='cls'){termClear();return}
  if(cmd==='help'){
    tPrint('\x1b[33mFerrum Studio — Zig Terminal\x1b[0m\n\n'+
      '  \x1b[2mrun [-- args]\x1b[0m      zig run <active file> [-- args]\n'+
      '  \x1b[2mbuild [step]\x1b[0m       zig build [step]\n'+
      '  \x1b[2mtest [args]\x1b[0m        zig test <active file>\n'+
      '  \x1b[2mfmt\x1b[0m                zig fmt <active file>\n'+
      '  \x1b[2mcheck\x1b[0m              zig ast-check (shows in Problems)\n'+
      '  \x1b[2mbuild-exe\x1b[0m          zig build-exe <active file>\n'+
      '  \x1b[2mzig <subcmd>\x1b[0m       any zig subcommand\n'+
      '  \x1b[2mversion\x1b[0m            zig version\n'+
      '  \x1b[2mclear\x1b[0m              clear terminal\n\n')
    return
  }
  if(cmd==='version'){go('ZigVersion').then(v=>tLine(v||'?'));return}
  if(cmd==='which'){tLine('zig: '+S.zigInfo.path);return}
  const needsFile=new Set(['run','test','fmt','check','build-exe','build-lib','build-obj'])
  if(needsFile.has(cmd)&&!tab?.path){tLine('No saved file open.','#f87171');return}
  if(cmd==='run'){if(tab.dirty)await cmdSaveAndCheck();const rest=p.slice(1).join(' ');runZig(rest?`run ${tab.path} -- ${rest}`:`run ${tab.path}`);return}
  if(cmd==='build'){runZig('build '+p.slice(1).join(' '));return}
  if(cmd==='test'){if(tab.dirty)await cmdSaveAndCheck();runZig(`test ${tab.path} ${p.slice(1).join(' ')}`);return}
  if(cmd==='fmt'){if(tab.dirty)await cmdSaveAndCheck();await cmdFmt();return}
  if(cmd==='check'){if(tab.dirty)await cmdSaveAndCheck();await cmdCheck();return}
  if(cmd==='build-exe'){if(tab.dirty)await cmdSaveAndCheck();runZig(`build-exe ${tab.path}`);return}
  if(cmd==='build-lib'){if(tab.dirty)await cmdSaveAndCheck();runZig(`build-lib ${tab.path}`);return}
  if(cmd==='init'){runZig('init');return}
  if(cmd==='env'){runZig('env');return}
  if(cmd==='targets'){runZig('targets');return}
  if(cmd==='zig'){runZig(p.slice(1).join(' '));return}
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
    ta.scrollTop=Math.max(0,(line-5)*22)
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
    const content=name.endsWith('.zig')?'const std = @import("std");\n':''
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
    tLine('Please open a folder first (File → Open Folder), then create a project.', '#f87171')
    closeAllDialogs()
    return
  }
  closeAllDialogs()
  tLine('\n$ zig init  (in ' + dir + ')', '#60a5fa')
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
  const mainPath = dir + (dir.includes('\\') ? '\\' : '/') + 'src/main.zig'
  const mainContent = await go('ReadFile', mainPath)
  if (mainContent) addTab(mainPath, 'main.zig', mainContent, 'zig')
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

function activateTab(id){ _lineCache.length=0; S.activeTab=id; reRenderEditor() }

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
  const diags=await go('ZigCheck',tab.path)
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
        <button class="wbtn primary" data-a="saveas:ok">💾 Save</button>
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
  runZig(`run ${tab.path}`)
}

async function cmdBuild() { runZig('build') }

async function cmdTest() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file open.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  S.testResults=[]
  renderTestResults()
  switchPanel('tests')
  runZig(`test ${tab.path}`)
}

async function cmdFmt() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file to format.','#f87171');return}
  if(tab.dirty)await cmdSaveAndCheck()
  tLine('\n$ zig fmt '+tab.name,'#60a5fa')
  const newContent=await go('ZigFmt',tab.path)
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
  tLine('\n$ zig ast-check '+tab.name,'#60a5fa')
  const diags=await go('ZigCheck',tab.path)
  applyDiags(diags||[])
  switchPanel('problems')
  const errs=(diags||[]).filter(d=>d.kind==='error').length
  if(!errs)tLine('✓ No errors.','#4ade80')
  else tLine(`✕ ${errs} error${errs>1?'s':''}  —  see Problems panel.`,'#f87171')
}

function cmdKill(){go('KillProc');if(S.running){setRunning(false);tLine('\nkilled.','#f87171')}}

function showArgsDialog() {
  const tab=activeTab()
  if(!tab?.path){tLine('No file open.','#f87171');return}
  const dlg=$('#args-dlg');if(!dlg)return
  const pre=$('#args-prefix');if(pre)pre.textContent=`zig run ${tab.name} -- `
  dlg.classList.remove('hidden')
  setTimeout(()=>$('#args-in')?.focus(),40)
}

async function runWithArgs() {
  const tab=activeTab();if(!tab?.path)return
  const args=($('#args-in')?.value||'').trim();closeAllDialogs()
  if(tab.dirty)await cmdSaveAndCheck()
  runZig(args?`run ${tab.path} -- ${args}`:`run ${tab.path}`)
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
  const pane = document.getElementById('code-pane')
  if (pane) pane.scrollTop = Math.max(0, (line-5)*22)
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
      <button class="find-btn" data-a="find:prev">↑</button>
      <button class="find-btn" data-a="find:next">↓</button>
      <label class="find-chk"><input type="checkbox" id="find-case"/> Aa</label>
      <label class="find-chk"><input type="checkbox" id="find-regex"/> .*</label>
      <button class="find-x" data-a="find:close">✕</button>`
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
  const lel=$('#sb-lang');if(lel)lel.textContent=lang==='zig'?'Zig':'Text'
  $('#tab-bar')?.replaceWith(buildTabBar())
  $('#editor-area')?.replaceWith(buildEditorArea())
  setTimeout(()=>$('#editor-ta')?.focus(),20)
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