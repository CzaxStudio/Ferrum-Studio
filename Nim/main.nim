## Welcome to Ferrum Studio — The Nim IDE
## This is a demo file. Open a real project with File -> Open Folder.

import std/strutils
import std/sequtils
import std/math
# A basic demonstration of Nim syntax

type
  Shape = object
    name*: string
    sides*: int

proc area*(s: Shape, sideLen: float): float =
  ## Calculate area of a regular polygon.
  let n = s.sides.float
  (n * sideLen * sideLen) / (4.0 * tan(PI / n))

proc greet*(name: string): string =
  "Hello, " & name & "! Welcome to Ferrum Studio."

when isMainModule:
  echo greet("Nim Developer")

  let shapes = @[
    Shape(name: "Triangle", sides: 3),
    Shape(name: "Square",   sides: 4),
    Shape(name: "Hexagon",  sides: 6),
  ]

  for s in shapes:
    let a = s.area(5.0)
    echo s.name & " area: " & $a.round(2)

  # Nim sequence operations
  let nums = @[1, 2, 3, 4, 5]
  let doubled = nums.map(proc(x: int): int = x * 2)
  echo "Doubled: " & $doubled
