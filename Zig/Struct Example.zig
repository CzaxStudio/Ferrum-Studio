const std = @import("std");

const Player = struct {
    name: []const u8,
    health: i32,
};

pub fn main() void {
    const player = Player{
        .name = "Hero",
        .health = 100,
    };

    std.debug.print("{s} has {} HP\n", .{player.name, player.health});
}