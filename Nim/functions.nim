# functions.nim - Demonstrating different function types
import std/math

# Basic procedure (no return value)
proc greet(name: string): void =
  echo "Hello, ", name, "!"

# Function with return value
proc add(x, y: int): int =
  return x + y

# Implicit return (last expression)
proc multiply(x, y: int): int =
  x * y

# Default parameters
proc introduce(name: string, age: int = 18): string =
  result = "My name is " & name & " and I'm " & $age & " years old"

# Multiple return values using tuples
proc divideWithRemainder(a, b: int): (int, int) =
  (a div b, a mod b)

# Generic function
proc identity[T](x: T): T = x

# Usage
greet("Alice")
echo add(10, 20)
echo multiply(5, 6)
echo introduce("Bob", 25)
let (quot, rem) = divideWithRemainder(17, 5)
echo "17/5 = ", quot, " remainder ", rem
echo identity(42)
echo identity("Hello")