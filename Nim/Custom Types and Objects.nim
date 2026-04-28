# types.nim - Working with custom types and objects

# Basic object
type
  Person = object
    name: string
    age: int
    email: string

# Object with inheritance (ref object for reference semantics)
  Student = ref object of Person
    studentId: string
    major: string

# Enumeration
  Color = enum
    Red, Green, Blue, Yellow

# Distinct type (for strong typing)
  UserId = distinct int
  ProductId = distinct int

# Tuple type
  Point = tuple[x, y: float]

# Methods for objects
proc introduce(self: Person): string =
  "Hi, I'm " & self.name & " and I'm " & $self.age

proc study(self: Student): string =
  self.name & " is studying " & self.major

# Object construction
let alice = Person(name: "Alice", age: 25, email: "alice@example.com")
let bob = Student(name: "Bob", age: 20, email: "bob@example.com", 
                  studentId: "S12345", major: "Computer Science")

# Usage
echo alice.introduce()
echo bob.introduce()  # Inherited method
echo bob.study()

# Enum usage
let myColor = Blue
case myColor
of Red: echo "It's red"
of Green: echo "It's green"
of Blue: echo "It's blue"
of Yellow: echo "It's yellow"

# Distinct types
var uid = UserId(123)
var pid = ProductId(456)
echo "User ID: ", uid.int  # Need to convert back