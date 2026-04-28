# errors.nim - Exception handling in Nim

import std/strutils

# Define custom exception
type
  DivideByZeroError = object of CatchableError
  InvalidInputError = object of CatchableError

# Function that may throw
proc divide(a, b: int): int =
  if b == 0:
    raise newException(DivideByZeroError, "Cannot divide by zero!")
  return a div b

proc parseIntWithCheck(s: string): int =
  try:
    result = parseInt(s)
  except ValueError:
    raise newException(InvalidInputError, "Invalid number: " & s)

# Using try-except-finally
proc safeDivision() =
  try:
    echo "Enter first number: "
    let a = parseInt(readLine(stdin))
    echo "Enter second number: "
    let b = parseInt(readLine(stdin))
    
    let result = divide(a, b)
    echo "Result: ", result
  
  except DivideByZeroError as e:
    echo "Math error: ", e.msg
  except ValueError:
    echo "Please enter valid numbers!"
  except CatchableError as e:
    echo "Unexpected error: ", e.msg
  finally:
    echo "Division attempt completed"

# Option type (more functional approach)
import std/options

proc safeDivide(a, b: int): Option[int] =
  if b == 0:
    return none(int)
  return some(a div b)

proc optionExample() =
  let result1 = safeDivide(10, 2)
  let result2 = safeDivide(10, 0)
  
  if result1.isSome:
    echo "10/2 = ", result1.get()
  else:
    echo "Division failed"
  
  # Using if let
  if result2.isSome:
    echo result2.get()
  else:
    echo "Cannot divide by zero!"
  
  # Using map
  let doubled = result1.map(proc(x: int): int = x * 2)
  echo "Doubled result: ", doubled.get(0)

# Result type (like Rust)
import std/result

proc riskyOperation(value: int): Result[int, string] =
  if value < 0:
    return err("Negative values not allowed")
  elif value == 0:
    return err("Zero is not valid")
  else:
    return ok(100 div value)

proc resultExample() =
  let res1 = riskyOperation(5)
  let res2 = riskyOperation(0)
  
  if res1.isOk:
    echo "Success: ", res1.get()
  else:
    echo "Error: ", res1.error()
  
  # Using try
  let value = res2.get() ?  # Will raise if error
  echo value

# Defer statement (like Go's defer)
proc deferExample() =
  var file: File
  try:
    file = open("test.txt", fmWrite)
    defer: file.close()  # Will run at end of scope
    
    file.writeLine("Hello")
    file.writeLine("World")
    # File automatically closed when function exits
  except IOError:
    echo "Failed to open file"

# Run examples
# Uncomment to test:
# safeDivision()
optionExample()
# resultExample()  # Uncomment carefully as it may raise
deferExample()