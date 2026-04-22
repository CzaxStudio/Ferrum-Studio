// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO — enhancements.js
//  • Project Templates (real, production-quality starters)
//  • Human-readable error explanations + fix suggestions
//  • Called from main.js — no global state needed except DOM helpers
// ══════════════════════════════════════════════════════════════════════════════

// ── Project Templates ─────────────────────────────────────────────────────────
// Real, working Zig project templates. Each produces multiple files.
export const TEMPLATES = [
  {
    id: 'exe',
    name: 'Executable',
    icon: '⚡',
    desc: 'A runnable command-line program with argument parsing',
    files: {
      'src/main.zig': `const std = @import("std");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    const args = try std.process.argsAlloc(alloc);
    defer std.process.argsFree(alloc, args);

    const stdout = std.io.getStdOut().writer();

    if (args.len < 2) {
        try stdout.print("Usage: {s} <name>\\n", .{args[0]});
        return;
    }

    try stdout.print("Hello, {s}!\\n", .{args[1]});
}
`,
      'build.zig': `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "myapp",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);

    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);

    const unit_tests = b.addTest(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    const run_unit_tests = b.addRunArtifact(unit_tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_unit_tests.step);
}
`,
      'build.zig.zon': `\`{'
    .name = .myapp,
    .version = "0.1.0",
    .minimum_zig_version = "0.13.0",
    .dependencies = .{},
    .paths = .{ "build.zig", "build.zig.zon", "src" },
}
`,
      'README.md': `# myapp

A Zig command-line application.

## Build & Run

\`\`\`bash
zig build run -- World
\`\`\`

## Test

\`\`\`bash
zig build test
\`\`\`
`,
    },
  },

  {
    id: 'lib',
    name: 'Library',
    icon: '📦',
    desc: 'A reusable Zig library with a clean public API',
    files: {
      'src/root.zig': `//! A reusable Zig library.
//! Import with: const mylib = @import("mylib");

const std = @import("std");

/// Add two numbers together.
pub fn add(a: i64, b: i64) i64 {
    return a + b;
}

/// Multiply two numbers.
pub fn multiply(a: i64, b: i64) i64 {
    return a * b;
}

/// A growable buffer that owns its memory.
pub const Buffer = struct {
    data: []u8,
    len: usize,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) Buffer {
        return .{ .data = &.{}, .len = 0, .allocator = allocator };
    }

    pub fn deinit(self: *Buffer) void {
        if (self.data.len > 0) self.allocator.free(self.data);
    }

    pub fn append(self: *Buffer, bytes: []const u8) !void {
        const new_len = self.len + bytes.len;
        if (new_len > self.data.len) {
            const new_cap = @max(new_len, self.data.len * 2 + 8);
            self.data = try self.allocator.realloc(self.data, new_cap);
        }
        @memcpy(self.data[self.len..][0..bytes.len], bytes);
        self.len = new_len;
    }

    pub fn slice(self: Buffer) []const u8 {
        return self.data[0..self.len];
    }
};

test "add works" {
    try std.testing.expectEqual(@as(i64, 5), add(2, 3));
}

test "Buffer append" {
    var buf = Buffer.init(std.testing.allocator);
    defer buf.deinit();
    try buf.append("Hello");
    try buf.append(", World!");
    try std.testing.expectEqualStrings("Hello, World!", buf.slice());
}
`,
      'build.zig': `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib = b.addStaticLibrary(.{
        .name = "mylib",
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    b.installArtifact(lib);

    const lib_unit_tests = b.addTest(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const run_lib_unit_tests = b.addRunArtifact(lib_unit_tests);
    const test_step = b.step("test", "Run library tests");
    test_step.dependOn(&run_lib_unit_tests.step);
}
`,
      'build.zig.zon': `.{
    .name = .mylib,
    .version = "0.1.0",
    .minimum_zig_version = "0.13.0",
    .dependencies = .{},
    .paths = .{ "build.zig", "build.zig.zon", "src" },
}
`,
    },
  },

  {
    id: 'server',
    name: 'TCP Server',
    icon: '🌐',
    desc: 'A basic TCP server that handles connections',
    files: {
      'src/main.zig': `const std = @import("std");
const net = std.net;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    const addr = try net.Address.parseIp("127.0.0.1", 8080);
    var server = try addr.listen(.{ .reuse_address = true });
    defer server.deinit();

    std.debug.print("Listening on http://127.0.0.1:8080\\n", .{});

    while (true) {
        const conn = try server.accept();
        const thread = try std.Thread.spawn(.{}, handleConn, .{ conn, alloc });
        thread.detach();
    }
}

fn handleConn(conn: net.Server.Connection, alloc: std.mem.Allocator) void {
    defer conn.stream.close();
    _ = alloc;

    var buf: [4096]u8 = undefined;
    const n = conn.stream.read(&buf) catch return;
    const request = buf[0..n];

    // Simple HTTP response
    const body = "Hello from Zig!\\n";
    const response = std.fmt.allocPrint(std.heap.page_allocator,
        "HTTP/1.1 200 OK\\r\\nContent-Length: {}\\r\\nContent-Type: text/plain\\r\\n\\r\\n{s}",
        .{ body.len, body }) catch return;
    defer std.heap.page_allocator.free(response);

    _ = request; // suppress unused warning
    conn.stream.writeAll(response) catch {};
}
`,
      'build.zig': `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const exe = b.addExecutable(.{
        .name = "server",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    b.installArtifact(exe);
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    const run_step = b.step("run", "Run the server");
    run_step.dependOn(&run_cmd.step);
}
`,
    },
  },

  {
    id: 'embedded',
    name: 'Embedded / Bare-Metal',
    icon: '🔧',
    desc: 'Freestanding Zig for microcontrollers (no OS, no libc)',
    files: {
      'src/main.zig': `// Bare-metal Zig — no OS, no libc, no std.
// Runs on any CPU target with linker script.
//
// Build with: zig build-exe src/main.zig -target thumb-freestanding-eabi ...

const UART_BASE: u32 = 0x40011000; // Example: STM32 USART1

const Uart = struct {
    fn init() void {
        // Configure UART peripheral (chip-specific)
        // This is a placeholder — replace with your MCU's init sequence
    }

    fn writeByte(b: u8) void {
        // Wait for TX empty, then write
        const DR = @as(*volatile u32, @ptrFromInt(UART_BASE + 0x04));
        DR.* = b;
    }

    fn writeStr(s: []const u8) void {
        for (s) |c| writeByte(c);
    }
};

// Entry point — called by startup code or linker _start
export fn main() noreturn {
    Uart.init();
    Uart.writeStr("Ferrum Studio — Zig Embedded\\r\\n");

    var counter: u32 = 0;
    while (true) {
        counter +%= 1;
        // Busy-wait delay
        var i: u32 = 0;
        while (i < 1_000_000) : (i += 1) {}
        Uart.writeStr("tick\\r\\n");
    }
}

// Panic handler — required for freestanding targets
pub fn panic(msg: []const u8, _: ?*@import("std").builtin.StackTrace, _: ?usize) noreturn {
    Uart.writeStr("PANIC: ");
    Uart.writeStr(msg);
    while (true) {}
}
`,
      'build.zig': `const std = @import("std");

pub fn build(b: *std.Build) void {
    // Change this target to match your MCU
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .thumb,
        .os_tag = .freestanding,
        .abi = .eabi,
        .cpu_model = .{ .explicit = &std.Target.arm.cpu.cortex_m4 },
    });

    const exe = b.addExecutable(.{
        .name = "firmware",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = .ReleaseSmall,
        .single_threaded = true,
    });

    // Link with your linker script
    // exe.setLinkerScriptPath(b.path("linker.ld"));

    b.installArtifact(exe);
}
`,
    },
  },

  {
    id: 'comptime',
    name: 'Comptime Metaprogramming',
    icon: '🧩',
    desc: 'Demonstrates comptime generics, reflection, and code generation',
    files: {
      'src/main.zig': `//! Zig comptime metaprogramming examples.
//! Zig uses comptime instead of macros/templates/generics.

const std = @import("std");

// ── Generic Stack ─────────────────────────────────────────────────────────────
// Comptime type parameter — fully specialized at compile time, zero overhead.
pub fn Stack(comptime T: type) type {
    return struct {
        items: []T,
        top: usize,
        alloc: std.mem.Allocator,

        const Self = @This();

        pub fn init(alloc: std.mem.Allocator, cap: usize) !Self {
            return .{
                .items = try alloc.alloc(T, cap),
                .top = 0,
                .alloc = alloc,
            };
        }

        pub fn deinit(self: *Self) void { self.alloc.free(self.items); }

        pub fn push(self: *Self, val: T) !void {
            if (self.top >= self.items.len) return error.Overflow;
            self.items[self.top] = val;
            self.top += 1;
        }

        pub fn pop(self: *Self) ?T {
            if (self.top == 0) return null;
            self.top -= 1;
            return self.items[self.top];
        }

        pub fn peek(self: Self) ?T {
            return if (self.top > 0) self.items[self.top - 1] else null;
        }
    };
}

// ── Compile-time field iteration ──────────────────────────────────────────────
// Print all fields and their types of any struct at runtime.
pub fn printFields(comptime T: type) void {
    const info = @typeInfo(T);
    inline for (info.@"struct".fields) |f| {
        std.debug.print("  {s}: {s}\\n", .{ f.name, @typeName(f.type) });
    }
}

// ── Compile-time string switch ─────────────────────────────────────────────────
pub fn httpStatusText(code: u16) []const u8 {
    return switch (code) {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        else => "Unknown",
    };
}

// ── Comptime array generation ─────────────────────────────────────────────────
// Generates a lookup table at compile time — zero runtime cost.
const SQUARES: [16]u32 = blk: {
    var arr: [16]u32 = undefined;
    for (&arr, 0..) |*v, i| v.* = i * i;
    break :blk arr;
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    // Generic Stack
    var s = try Stack(i32).init(alloc, 8);
    defer s.deinit();
    try s.push(10);
    try s.push(20);
    try s.push(30);
    std.debug.print("Stack peek: {}\\n", .{s.peek().?});
    std.debug.print("Stack pop:  {}\\n", .{s.pop().?});

    // Comptime field info
    const Point = struct { x: f32, y: f32, label: []const u8 };
    std.debug.print("Fields of Point:\\n", .{});
    printFields(Point);

    // Comptime squares table
    std.debug.print("Squares 0..7: ", .{});
    for (SQUARES[0..8]) |sq| std.debug.print("{} ", .{sq});
    std.debug.print("\\n", .{});

    // HTTP status
    std.debug.print("HTTP 404: {s}\\n", .{httpStatusText(404)});
}

test "Stack works" {
    var s = try Stack(u8).init(std.testing.allocator, 4);
    defer s.deinit();
    try s.push(1);
    try s.push(2);
    try std.testing.expectEqual(@as(?u8, 2), s.pop());
    try std.testing.expectEqual(@as(?u8, 1), s.pop());
    try std.testing.expectEqual(@as(?u8, null), s.pop());
}
`,
      'build.zig': `const std = @import("std");
pub fn build(b: *std.Build) void {
    const t = b.standardTargetOptions(.{});
    const o = b.standardOptimizeOption(.{});
    const exe = b.addExecutable(.{ .name="comptime-demo", .root_source_file=b.path("src/main.zig"), .target=t, .optimize=o });
    b.installArtifact(exe);
    const run = b.addRunArtifact(exe); run.step.dependOn(b.getInstallStep());
    b.step("run","Run").dependOn(&run.step);
    const tests = b.addTest(.{ .root_source_file=b.path("src/main.zig"), .target=t, .optimize=o });
    b.step("test","Test").dependOn(&b.addRunArtifact(tests).step);
}
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

// Called when user picks a template — creates files and opens them
async function applyTemplate(tpl) {
  // Get the Go bridge
  const goFn = (method, ...args) => {
    const fn = window?.go?.main?.App?.[method]
    if (fn) return fn(...args)
    return Promise.resolve(null)
  }

  const root = await goFn('GetProjectRoot') || ''
  if (!root) {
    alert('Please open a project folder first (File → Open Folder)')
    return
  }

  const sep = root.includes('\\') ? '\\' : '/'
  const created = []

  for (const [relPath, content] of Object.entries(tpl.files)) {
    const fullPath = root + sep + relPath.replace(/\//g, sep)
    // Ensure directory exists
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
    await goFn('CreateDir', dir)
    const err = await goFn('WriteFile', fullPath, content)
    if (!err) created.push({ path: fullPath, name: relPath.split('/').pop(), content })
  }

  // Fire custom event so main.js can open the files and refresh tree
  window.dispatchEvent(new CustomEvent('ferrum:template-applied', {
    detail: { template: tpl, files: created, root }
  }))
}

// ── Human-readable error explanations ────────────────────────────────────────
// Maps Zig compiler error patterns to human explanations + fix suggestions.
// The key is a regex that matches the error message.
const ZIG_ERROR_EXPLANATIONS = [
  // ── Type errors ──────────────────────────────────────────────────────────
  {
    match: /expected type '(.+?)', found '(.+?)'/,
    title: 'Type mismatch',
    explain: (m) => `You gave a value of type \`${m[2]}\` but the code expects type \`${m[1]}\`.`,
    fix: (m) => `Cast or convert the value: try \`@as(${m[1]}, value)\` or \`@intCast(value)\` for integers, \`@floatCast(value)\` for floats.`,
  },
  {
    match: /cannot assign to constant/,
    title: 'Writing to a constant',
    explain: () => 'You tried to assign a new value to a `const` variable. In Zig, `const` means the binding can never change.',
    fix: () => 'Change `const` to `var` if you need to modify it. Example: `var x: i32 = 5;`',
  },
  {
    match: /use of undeclared identifier '(.+?)'/,
    title: 'Unknown name',
    explain: (m) => `Zig cannot find anything named \`${m[1]}\` in the current scope.`,
    fix: (m) => `Check spelling. Did you forget to import it? Try \`const ${m[1]} = @import("...");\` or declare it before use.`,
  },
  {
    match: /expected '(.+?)', found '(.+?)'\s*note: return type declared here/,
    title: 'Wrong return type',
    explain: (m) => `Your function says it returns \`${m[1]}\` but you are returning \`${m[2]}\`.`,
    fix: (m) => `Either change the return statement to return \`${m[1]}\`, or update the function signature to return \`${m[2]}\`.`,
  },
  {
    match: /unused variable: '(.+?)'/,
    title: 'Unused variable',
    explain: (m) => `Variable \`${m[1]}\` is declared but never read. Zig treats this as an error to prevent bugs.`,
    fix: (m) => `Either use the variable, or replace it with \`_\` to explicitly discard it: \`_ = ${m[1]};\``,
  },
  {
    match: /unused function parameter: '(.+?)'/,
    title: 'Unused function parameter',
    explain: (m) => `Parameter \`${m[1]}\` is never used inside the function.`,
    fix: (m) => `Add \`_ = ${m[1]};\` at the top of the function to mark it intentionally unused.`,
  },
  // ── Error handling ────────────────────────────────────────────────────────
  {
    match: /error is discarded/,
    title: 'Error not handled',
    explain: () => 'This expression can return an error but you are ignoring it.',
    fix: () => 'Handle the error with `try` (propagates to caller), `catch` (handle inline), or `catch unreachable` (crash in debug). Example: `const val = try someFunc();`',
  },
  {
    match: /error union '(.+?)' is not an error/,
    title: 'Unnecessary error union',
    explain: () => 'You used `!T` (error union) but the type cannot actually produce an error here.',
    fix: () => 'Remove the `!` from the type. Change `!T` to just `T`.',
  },
  {
    match: /cannot store runtime value in compile-time variable/,
    title: 'Comptime/runtime mismatch',
    explain: () => 'You tried to store a runtime-computed value into a `comptime` variable.',
    fix: () => 'Either make the value comptime-known (use `comptime` expressions), or change the variable to `var` instead of `comptime var`.',
  },
  // ── Memory / pointer errors ───────────────────────────────────────────────
  {
    match: /expected pointer, found '(.+?)'/,
    title: 'Expected a pointer',
    explain: (m) => `The code expects a pointer (\`*T\`) but you passed \`${m[1]}\` (a value, not a pointer).`,
    fix: () => 'Pass a pointer with `&value`. Example: `someFunc(&myVar)` instead of `someFunc(myVar)`.',
  },
  {
    match: /attempt to use null value/,
    title: 'Using a null optional',
    explain: () => 'You tried to use an optional value (`?T`) without checking if it is `null` first.',
    fix: () => 'Unwrap safely: `if (opt) |val| { use(val); }` or use `opt orelse defaultVal` or `opt orelse unreachable`.',
  },
  {
    match: /index out of bounds/,
    title: 'Array index out of bounds',
    explain: () => 'You accessed an array or slice at an index that does not exist.',
    fix: () => 'Check that your index is `< slice.len` before accessing. Use `if (i < arr.len) arr[i]` pattern.',
  },
  // ── Integer / arithmetic ──────────────────────────────────────────────────
  {
    match: /integer overflow/,
    title: 'Integer overflow',
    explain: () => 'An arithmetic operation produced a value too large for the integer type.',
    fix: () => 'Use a wider integer type (e.g. `i64` instead of `i32`), or use wrapping operators (`+%`, `*%`) if overflow is intentional.',
  },
  {
    match: /no member named '(.+?)' in enum '(.+?)'/,
    title: 'Unknown enum variant',
    explain: (m) => `Enum \`${m[2]}\` does not have a variant named \`${m[1]}\`.`,
    fix: (m) => `Check the enum definition for the correct variant names. Use \`@typeInfo(${m[2]})\` at comptime to inspect.`,
  },
  // ── Struct / field errors ─────────────────────────────────────────────────
  {
    match: /no field named '(.+?)' in struct '(.+?)'/,
    title: 'Unknown struct field',
    explain: (m) => `Struct \`${m[2]}\` has no field called \`${m[1]}\`.`,
    fix: (m) => `Check the struct definition. Use \`@typeInfo(${m[2]}).@"struct".fields\` at comptime to see all fields.`,
  },
  {
    match: /missing field '(.+?)'/,
    title: 'Missing struct field in initialization',
    explain: (m) => `You created a struct literal but did not provide a value for field \`${m[1]}\`.`,
    fix: (m) => `Add \`.${m[1]} = value\` to the struct literal, or give the field a default value in the struct definition.`,
  },
  // ── Import / module errors ────────────────────────────────────────────────
  {
    match: /unable to find '(.+?)'/,
    title: 'Import not found',
    explain: (m) => `Zig could not find the file or package \`${m[1]}\`.`,
    fix: (m) => `Check the path is correct relative to this file. For standard library: \`@import("std")\`. For local files: \`@import("./utils.zig")\`. For packages: add them to \`build.zig.zon\`.`,
  },
  // ── Function errors ───────────────────────────────────────────────────────
  {
    match: /too many arguments to function/,
    title: 'Too many arguments',
    explain: () => 'You called a function with more arguments than it accepts.',
    fix: () => 'Check the function signature and remove the extra argument(s).',
  },
  {
    match: /expected (\d+) argument\(s\), found (\d+)/,
    title: 'Wrong number of arguments',
    explain: (m) => `Function expects ${m[1]} argument(s) but you passed ${m[2]}.`,
    fix: (m) => `Add or remove arguments to match the expected ${m[1]}.`,
  },
  // ── Fallback ──────────────────────────────────────────────────────────────
  {
    match: /.*/,
    title: null,
    explain: () => null,
    fix: () => null,
  },
]

/**
 * Given a raw Zig error message, returns { title, explain, fix } or null.
 * title   — short label like "Type mismatch"
 * explain — one sentence what went wrong in human terms
 * fix     — concrete suggestion of how to fix it
 */
export function explainError(message) {
  for (const entry of ZIG_ERROR_EXPLANATIONS) {
    const m = message.match(entry.match)
    if (m) {
      const title   = entry.title
      const explain = entry.explain(m)
      const fix     = entry.fix(m)
      if (!explain) return null   // fallback entry matched, no explanation
      return { title, explain, fix }
    }
  }
  return null
}

/**
 * Build the enhanced Problems panel item HTML.
 * Instead of a raw error dump, shows:
 *   [icon] human title (explain)
 *          Fix: suggestion
 *          file:line:col  [source badge]
 */
export function buildEnhancedProblemItem(diag) {
  const explanation = explainError(diag.message)
  const icon = diag.kind === 'error' ? '✕' : diag.kind === 'warning' ? '⚠' : 'ℹ'
  const kindClass = diag.kind

  const rawMsg = diag.message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const loc = `${diag.file.replace(/\\/g, '/').split('/').pop()}:${diag.line}:${diag.col}`

  if (!explanation) {
    // No explanation — render normal but still nicer than a dump
    return `<div class="prob-item ${kindClass}" data-a="prob:goto"
        data-file="${diag.file}" data-line="${diag.line}" data-col="${diag.col}">
      <span class="prob-icon">${icon}</span>
      <div class="prob-body">
        <span class="prob-msg">${rawMsg}</span>
        <span class="prob-loc">${loc}</span>
      </div>
    </div>`
  }

  const explainHtml = explanation.explain
    .replace(/`([^`]+)`/g, '<code class="prob-code">$1</code>')
  const fixHtml = explanation.fix
    .replace(/`([^`]+)`/g, '<code class="prob-code">$1</code>')

  return `<div class="prob-item ${kindClass} prob-enhanced" data-a="prob:goto"
      data-file="${diag.file}" data-line="${diag.line}" data-col="${diag.col}">
    <span class="prob-icon">${icon}</span>
    <div class="prob-body">
      <div class="prob-title">${explanation.title}</div>
      <div class="prob-explain">${explainHtml}</div>
      <div class="prob-fix"><span class="prob-fix-label">Fix →</span> ${fixHtml}</div>
      <div class="prob-raw">${rawMsg}</div>
      <span class="prob-loc">${loc}</span>
    </div>
  </div>`
}