# hello.nim - Basic program with input/output
echo "Hello, Nim!"

# User input example
stdout.write "What's your name? "
stdout.flushFile()
let name = stdin.readLine()
echo "Nice to meet you, ", name, "!"

# Type inference
let age = 25  # int
let pi = 3.14159  # float
let isAwesome = true  # bool