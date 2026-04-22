const std = @import("std");

test "loop with continue expression" {
    var i: u32 = 0;
    var sum: u32 = 0;
    
    // The colon starts the 'continue expression'
    while (i < 10) : (i += 1) {
        if (i % 2 == 0) continue;
        sum += i;
    }
    
    try std.testing.expect(sum == 25); // 1 + 3 + 5 + 7 + 9
}
