# threads.nim - Multithreading examples
import std/[threadpool, locks, times, random]

# Basic thread pool example
proc worker(id: int) {.thread.} =
  echo "Worker ", id, " starting"
  sleep(1000)  # Simulate work
  echo "Worker ", id, " finished"

proc basicThreadExample() =
  var threads: array[5, Thread[int]]
  
  for i in 0..<threads.len:
    createThread(threads[i], worker, i)
  
  joinThreads(threads)

# Parallel task execution
import std/sequtils

proc expensiveComputation(n: int): int =
  # Simulate expensive work
  var sum = 0
  for i in 1..n:
    sum += i * i
    sleep(1)  # Simulate work
  return sum

proc parallelMapExample() =
  let numbers = [1000, 2000, 1500, 3000, 2500]
  
  echo "Sequential processing:"
  let startSeq = epochTime()
  let seqResults = numbers.map(expensiveComputation)
  let endSeq = epochTime()
  echo "Results: ", seqResults
  echo "Time: ", (endSeq - startSeq).formatFloat(ffDecimal, 2), "s"
  
  echo "\nParallel processing:"
  let startPar = epochTime()
  var parResults = newSeq[int](numbers.len)
  parallel:
    for i in 0..<numbers.len:
      spawn parResults[i] = expensiveComputation(numbers[i])
  let endPar = epochTime()
  echo "Results: ", parResults
  echo "Time: ", (endPar - startPar).formatFloat(ffDecimal, 2), "s"

# Thread synchronization with locks
var counter = 0
var lock: Lock

proc incrementCounter() {.thread.} =
  for i in 1..1000:
    acquire(lock)
    counter += 1
    release(lock)

proc lockExample() =
  initLock(lock)
  
  var threads: array[10, Thread[void]]
  
  for i in 0..<threads.len:
    createThread(threads[i], incrementCounter)
  
  joinThreads(threads)
  echo "Final counter value: ", counter

# Channel communication
import std/channels

type
  Message = object
    id: int
    content: string

var channel: Channel[Message]

proc producer() {.thread.} =
  for i in 1..5:
    let msg = Message(id: i, content: "Message " & $i)
    channel.send(msg)
    echo "Sent: ", msg.content
    sleep(500)
  channel.close()

proc consumer() {.thread.} =
  while true:
    let msg = channel.recv()
    if msg.id == 0:  # Check for closed channel
      break
    echo "Received: ", msg.content, " (ID: ", msg.id, ")"
    sleep(200)

proc channelExample() =
  channel.open()
  
  var prodThread: Thread[void]
  var consThread: Thread[void]
  
  createThread(prodThread, producer)
  createThread(consThread, consumer)
  
  joinThread(prodThread)
  joinThread(consThread)

# Parallel for loop (using threadpool)
import std/threadpool

proc processItem(item: int) =
  echo "Processing item ", item, " on thread ", threadId()
  sleep(100)

proc parallelForExample() =
  let items = 1..20
  
  parallel:
    for item in items:
      spawn processItem(item)

# Atomic operations
import std/atomics

var atomicCounter: Atomic[int]

proc atomicIncrement() {.thread.} =
  for i in 1..1000:
    discard atomicCounter.fetchAdd(1)

proc atomicExample() =
  atomicCounter.store(0)
  
  var threads: array[10, Thread[void]]
  
  for i in 0..<threads.len:
    createThread(threads[i], atomicIncrement)
  
  joinThreads(threads)
  echo "Atomic counter: ", atomicCounter.load()

# Run examples
randomize()
echo "Basic Thread Example:"
basicThreadExample()

echo "\nParallel Map Example:"
parallelMapExample()

echo "\nLock Example:"
lockExample()

echo "\nChannel Example:"
channelExample()

echo "\nParallel For Example:"
parallelForExample()

echo "\nAtomic Example:"
atomicExample()