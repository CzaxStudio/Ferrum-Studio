const std = @import("std");

pub fn main() void {
    var prng = std.rand.DefaultPrng.init(12345);
    const rand = prng.random();

    const number = rand.intRangeAtMost(i32, 1, 100);
    std.debug.print("Random: {}\n", .{number});
}