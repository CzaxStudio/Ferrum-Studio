# control.nim - Control flow examples
import std/random

# If-elif-else
proc gradeComment(score: int): string =
  if score >= 90:
    "Excellent!"
  elif score >= 75:
    "Good job!"
  elif score >= 60:
    "Passing"
  else:
    "Need improvement"

# Case statement (switch)
proc dayName(day: int): string =
  case day
  of 1: "Monday"
  of 2: "Tuesday"
  of 3: "Wednesday"
  of 4: "Thursday"
  of 5: "Friday"
  of 6: "Saturday"
  of 7: "Sunday"
  else: "Invalid day"

# While loop
proc countdown(n: int): void =
  var i = n
  while i > 0:
    echo i
    dec i
  echo "Blast off!"

# For loop with ranges
proc sumToN(n: int): int =
  var total = 0
  for i in 1..n:
    total += i
  return total

# For loop with custom step
proc evenNumbers(): seq[int] =
  result = @[]
  for i in countup(2, 20, 2):
    result.add(i)

# Usage
echo gradeComment(85)
echo dayName(3)
countdown(5)
echo "Sum 1 to 10: ", sumToN(10)
echo "Even numbers: ", evenNumbers()