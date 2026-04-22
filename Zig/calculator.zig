const std = @import("std");

pub fn main() void {
    const a: i32 = 10;
    const b: i32 = 5;

    std.debug.print("Add: {}\n", .{a + b});
    std.debug.print("Sub: {}\n", .{a - b});
    std.debug.print("Mul: {}\n", .{a * b});
    std.debug.print("Div: {}\n", .{a / b});
}