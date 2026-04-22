const std = @import("std");

// A generic wrapper struct
pub fn Box(comptime T: type) type {
    return struct {
        value: T,
        
        pub fn init(v: T) @This() {
            return .{ .value = v };
        }
    };
}

test "test generic box" {
    const int_box = Box(i32).init(42);
    try std.testing.expect(int_box.value == 42);
}
