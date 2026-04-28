# fileio.nim - File operations examples
import std/[strutils, times]

# Reading entire file
proc readWholeFile(filename: string): string =
  try:
    result = readFile(filename)
  except IOError:
    echo "Error reading file: ", filename
    result = ""

# Writing to file
proc writeToFile(filename: string, content: string) =
  try:
    writeFile(filename, content)
    echo "Successfully wrote to ", filename
  except IOError:
    echo "Error writing to file"

# Reading line by line
proc processLines(filename: string) =
  var lineCount = 0
  for line in lines(filename):
    lineCount += 1
    if lineCount <= 5:  # Show first 5 lines
      echo "Line ", lineCount, ": ", line
  echo "Total lines: ", lineCount

# CSV file parsing
import std/streams

proc readCSV(filename: string): seq[seq[string]] =
  result = @[]
  let file = openFileStream(filename, fmRead)
  defer: file.close()
  
  while not file.atEnd():
    let line = file.readLine()
    let fields = line.split(',')
    result.add(fields)

# Writing CSV
proc writeCSV(filename: string, data: seq[seq[string]]) =
  let file = openFileStream(filename, fmWrite)
  defer: file.close()
  
  for row in data:
    file.writeLine(row.join(","))

# Appending to file
proc appendToFile(filename: string, text: string) =
  var file = open(filename, fmAppend)
  defer: file.close()
  file.writeLine(text)

# File information
proc getFileInfo(filename: string) =
  if fileExists(filename):
    let info = getFileInfo(filename)
    echo "File: ", filename
    echo "Size: ", info.size, " bytes"
    echo "Created: ", info.creationTime.format("yyyy-MM-dd HH:mm:ss")
    echo "Modified: ", info.lastWriteTime.format("yyyy-MM-dd HH:mm:ss")
  else:
    echo "File not found: ", filename

# Directory operations
import std/os

proc listDirectory(dir: string) =
  if not dirExists(dir):
    echo "Directory not found: ", dir
    return
  
  echo "Contents of ", dir, ":"
  for kind, path in walkDir(dir):
    let name = extractFilename(path)
    case kind
    of pcFile: echo "  📄 ", name
    of pcDir: echo "  📁 ", name
    of pcLink: echo "  🔗 ", name

# Practical example: todo list manager
type
  Todo = object
    text: string
    completed: bool
    createdAt: DateTime

proc saveTodos(filename: string, todos: seq[Todo]) =
  var file = open(filename, fmWrite)
  defer: file.close()
  
  for todo in todos:
    file.writeLine("TODO|" & todo.text & "|" & $todo.completed & 
                   "|" & $todo.createdAt.toUnix)

proc loadTodos(filename: string): seq[Todo] =
  result = @[]
  if not fileExists(filename):
    return
  
  for line in lines(filename):
    let parts = line.split('|')
    if parts.len >= 3 and parts[0] == "TODO":
      let todo = Todo(
        text: parts[1],
        completed: parts[2] == "true",
        createdAt: fromUnix(parseInt(parts[3]))
      )
      result.add(todo)

# Demo
proc demoFileIO() =
  # Write some data
  writeToFile("sample.txt", "Hello\nNim\nFile I/O Example")
  
  # Read entire file
  let content = readWholeFile("sample.txt")
  echo "File content:\n", content
  
  # Append more content
  appendToFile("sample.txt", "\nAppended line")
  
  # Process line by line
  echo "\nProcessing lines:"
  processLines("sample.txt")
  
  # CSV example
  let data = @[
    @["Name", "Age", "City"],
    @["Alice", "25", "New York"],
    @["Bob", "30", "London"],
    @["Charlie", "35", "Tokyo"]
  ]
  writeCSV("data.csv", data)
  
  let csvData = readCSV("data.csv")
  echo "\nCSV data:"
  for row in csvData:
    echo row.join(" | ")
  
  # Todo example
  let todos = @[
    Todo(text: "Learn Nim", completed: true, createdAt: now()),
    Todo(text: "Build an app", completed: false, createdAt: now()),
    Todo(text: "Share with community", completed: false, createdAt: now())
  ]
  saveTodos("todos.txt", todos)
  let loadedTodos = loadTodos("todos.txt")
  echo "\nLoaded todos:"
  for todo in loadedTodos:
    let status = if todo.completed: "✓" else: "○"
    echo status, " ", todo.text

# Run demonstrations
demoFileIO()
listDirectory(".")
getFileInfo("sample.txt")