# macros.nim - Advanced metaprogramming examples
import std/macros
import std/strformat

# Simple macro that prints before evaluation
macro debugEval(expr: untyped): untyped =
  result = quote do:
    let value = `expr`
    echo "Debug: ", astToStr(`expr`), " = ", value
    value

# Macro that measures execution time
macro timeIt(expr: untyped): untyped =
  result = quote do:
    block:
      let start = epochTime()
      let result = `expr`
      let elapsed = (epochTime() - start) * 1000
      echo "Execution time: ", elapsed, "ms"
      result

# Logging macro with filename and line number
macro log(msg: string): untyped =
  let line = msg.lineinfo
  result = quote do:
    echo &"[{line.filename}:{line.line}] {`msg`}"

# Assert macro with detailed message
macro myAssert(cond: untyped, msg: string = ""): untyped =
  let condStr = astToStr(cond)
  result = quote do:
    if not `cond`:
      let errorMsg = if `msg`.len > 0: `msg` else: "Assertion failed: " & `condStr`
      raise newException(AssertionDefect, errorMsg)

# Pattern matching macro (like functional languages)
macro match(value: untyped, patterns: untyped): untyped =
  result = newStmtList()
  let valueSym = genSym(nskLet, "matchValue")
  result.add quote do:
    let `valueSym` = `value`
  
  for pattern in patterns:
    let condition = pattern[0]
    let action = pattern[1]
    
    if condition.kind == nnkElse:
      result.add quote do:
        else:
          `action`
    else:
      result.add quote do:
        if `valueSym` == `condition`:
          `action`

# Builder pattern macro
macro buildAST(code: untyped): untyped =
  result = newStmtList()
  
  proc processNode(node: NimNode): NimNode =
    case node.kind
    of nnkCall:
      if node[0].kind == nnkIdent and node[0].strVal == "create":
        result = newCall(bindSym"newIdentNode", node[1])
      else:
        result = node
    else:
      result = node
  
  result.add processNode(code)

# Domain Specific Language (DSL) for HTML
macro html(code: untyped): untyped =
  result = newStmtList()
  
  proc processTag(tag: NimNode): NimNode =
    if tag.kind == nnkCall:
      let tagName = $tag[0]
      result = newCall(bindSym"echo", newLit(&"<{tagName}>"))
      
      for i in 1..<tag.len:
        result.add(processTag(tag[i]))
      
      result.add(newCall(bindSym"echo", newLit(&"</{tagName}>")))
    else:
      result = newCall(bindSym"echo", newLit($tag))
  
  for node in code:
    result.add(processTag(node))

# Code generation macro
macro generateEnumAccessors(enumType: typedesc): untyped =
  let typeName = enumType.getType()
  let typeNameStr = $typeName
  
  result = newStmtList()
  
  for child in typeName:
    if child.kind == nnkSym:
      let fieldName = $child
      let capitalized = fieldName.capitalizeAscii()
      
      let getterName = ident("get" & capitalized)
      let setterName = ident("set" & capitalized)
      
      result.add quote do:
        proc `getterName`(e: `typeNameStr`): bool =
          e == `typeNameStr`.`fieldName`
        
        proc `setterName`(e: var `typeNameStr`, value: bool) =
          if value:
            e = `typeNameStr`.`fieldName`

# Compile-time computation macro
macro computeAtCompileTime(value: static[int]): untyped =
  # This runs at compile time
  let result = value.intVal * value.intVal
  result = newLit(result)

# Practical example: Unit testing DSL
macro testSuite(name: string, tests: untyped): untyped =
  result = newStmtList()
  
  result.add quote do:
    var testCount = 0
    var passCount = 0
    echo "\n=== Test Suite: ", `name`, " ==="
  
  for test in tests:
    if test.kind == nnkCall and test[0].kind == nnkIdent and test[0].strVal == "test":
      let testName = test[1]
      let testBody = test[2]
      
      result.add quote do:
        inc testCount
        try:
          `testBody`
          inc passCount
          echo "✓ ", `testName`
        except:
          echo "✗ ", `testName`, " - ", getCurrentExceptionMsg()
  
  result.add quote do:
    echo &"\nResults: {passCount}/{testCount} tests passed"
    if passCount == testCount:
      echo "All tests passed! ✓"
    else:
      echo "Some tests failed! ✗"

# Demo usage
macroDemo:
  # Using debug macro
  let x = 10
  let y = 20
  let sum = debugEval(x + y)
  
  # Using time macro
  var result = timeIt:
    var s = 0
    for i in 1..100000:
      s += i
    s
  echo "Result: ", result
  
  # Using log macro
  log("Starting program")
  
  # Using assert macro
  myAssert(1 + 1 == 2, "Math is broken!")
  # myAssert(1 + 1 == 3)  # This would fail
  
  # Using match macro
  let value = 42
  match value:
    10: echo "It's ten"
    20: echo "It's twenty"
    42: echo "The answer to everything!"
    else: echo "Unknown value"
  
  # Using HTML DSL
  html:
    div:
      h1("Welcome to Nim!")
      p("This is generated by a macro")
      ul:
        li("Item 1")
        li("Item 2")
        li("Item 3")
  
  # Using compile-time computation
  let squared = computeAtCompileTime(15)
  echo "15 squared at compile time: ", squared
  
  # Running test suite
  testSuite("Math Tests"):
    test "Addition":
      assert 1 + 1 == 2
      assert 5 + 3 == 8
    
    test "Multiplication":
      assert 2 * 3 == 6
      assert 4 * 5 == 20
    
    test "Division":
      assert 10 / 2 == 5.0
      assert 15 / 3 == 5.0
  
  testSuite("String Tests"):
    test "Concatenation":
      assert "Hello " & "World" == "Hello World"
    
    test "Length":
      assert "Nim".len == 3

# Custom enum with accessors
type
  MyFlags = enum
    isEnabled
    isVisible
    isActive

generateEnumAccessors(MyFlags)

when isMainModule:
  macroDemo()
  
  # Using generated accessors
  var flags = MyFlags.isEnabled
  echo "isEnabled: ", getisEnabled(flags)
  echo "isVisible: ", getisVisible(flags)
  setisVisible(flags, true)
  echo "After set: isVisible: ", getisVisible(flags)