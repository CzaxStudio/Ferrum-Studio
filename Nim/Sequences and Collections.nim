# sequences.nim - Working with sequences and collections

# Basic sequence operations
proc seqExamples() =
  # Creating sequences
  var numbers: seq[int] = @[]
  let fixed = @[1, 2, 3, 4, 5]
  
  # Adding elements
  numbers.add(10)
  numbers.addAll([20, 30, 40])
  
  # Insert at position
  numbers.insert(15, 1)  # Insert 15 at index 1
  
  # Remove elements
  numbers.delete(2)  # Remove element at index 2
  numbers.del(0)     # Delete element at index 0
  
  # Accessing elements
  echo "First element: ", numbers[0]
  echo "Last element: ", numbers[^1]  # Negative indexing
  
  # Sequence length
  echo "Length: ", numbers.len
  
  # Iteration
  for i, value in numbers:
    echo "Index ", i, ": ", value

# List comprehensions
proc getSquares(n: int): seq[int] =
  result = @[]
  for i in 1..n:
    result.add(i * i)

# Filtering with map/filter (functional style)
import std/sequtils

proc functionalExamples() =
  let numbers = @[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  
  # Map - transform each element
  let doubled = numbers.map(proc(x: int): int = x * 2)
  echo "Doubled: ", doubled
  
  # Filter - keep elements that satisfy condition
  let evens = numbers.filter(proc(x: int): bool = x mod 2 == 0)
  echo "Evens: ", evens
  
  # Fold/reduce - combine all elements
  let sum = numbers.foldl(a + b)
  echo "Sum: ", sum
  
  # Any/all - check conditions
  let hasEven = numbers.any(proc(x: int): bool = x mod 2 == 0)
  echo "Contains even: ", hasEven

# Sets
proc setExamples() =
  var mySet = initHashSet[int]()
  mySet.incl(1)
  mySet.incl(2)
  mySet.incl(3)
  mySet.incl(2)  # Duplicate, won't be added
  
  echo "Set contains: ", mySet
  echo "Contains 2? ", 2 in mySet
  
  let setA = [1, 2, 3].toHashSet
  let setB = [3, 4, 5].toHashSet
  
  echo "Union: ", setA + setB
  echo "Intersection: ", setA * setB
  echo "Difference: ", setA - setB

# Tables (dictionaries)
import std/tables

proc tableExamples() =
  var scores = initTable[string, int]()
  scores["Alice"] = 95
  scores["Bob"] = 87
  scores["Charlie"] = 92
  
  echo "Bob's score: ", scores["Bob"]
  
  # Iterate over table
  for name, score in scores.mpairs:
    echo name, ": ", score
  
  # Check existence
  if scores.hasKey("David"):
    echo "David's score: ", scores["David"]
  else:
    echo "David not found"

# Run examples
seqExamples()
echo "Squares: ", getSquares(5)
functionalExamples()
setExamples()
tableExamples()