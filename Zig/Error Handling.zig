const std = @import("std");

const MyError = error{ BadValue, UnexpectedInput };

fn checkNumber(n: i32) MyError!i32 {
    if (n < 0) return error.BadValue;
    return n * 2;
}

pub fn main() !void {
    const result = checkNumber(-5) catch |err| {
        std.debug.print("Caught error: {}\n", .{err});
        return;
    };
    std.debug.print("Result: {d}\n", .{result});
}
