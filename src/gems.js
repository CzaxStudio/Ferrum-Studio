// ══════════════════════════════════════════════════════════════════════════════
//  FERRUM STUDIO — gems.js
//  The "Nim Treasure Map" — curated snippets, patterns, and language gems.
// ══════════════════════════════════════════════════════════════════════════════

export const GEMS = [
  {
    category: "Metaprogramming",
    items: [
      {
        name: "Timed Execution Template",
        desc: "Wraps a block of code to measure and print its execution time.",
        code: `import std/times

template timed*(label: string, body: untyped) =
  let t0 = cpuTime()
  body
  echo label & ": " & $(cpuTime() - t0) & "s"

# Usage:
timed "heavy work":
  for i in 1..1_000_000: discard i * i`
      },
      {
        name: "Debug Variable (dump)",
        desc: "Prints both the name and the value of a variable (from std/sugar).",
        code: `import std/sugar

let myVar = 42
dump(myVar) # Output: myVar = 42`
      }
    ]
  },
  {
    category: "Functional Patterns",
    items: [
      {
        name: "Collect macro",
        desc: "List comprehension style collection for seqs, tables, and sets.",
        code: `import std/sugar

let data = @[1, 2, 3, 4, 5]
let evens = collect(newSeq):
  for x in data:
    if x % 2 == 0: x * 10

echo evens # @[20, 40]`
      },
      {
        name: "Chained Optionals",
        desc: "Safely handle optional values using std/options.",
        code: `import std/options

let x = some(10)
let y = x.map(it => it * 2).get(0)
echo y # 20`
      }
    ]
  },
  {
    category: "String & JSON",
    items: [
      {
        name: "JSON DSL (%*)",
        desc: "Construct JSON objects with a natural, nested syntax.",
        code: `import std/json

let data = %* {
  "name": "Nim",
  "tags": ["compiled", "efficient", "elegant"],
  "stats": { "rank": 1, "speed": "fast" }
}
echo $data`
      },
      {
        name: "Multi-line Strings",
        desc: "Triple quotes for multi-line strings with unindentation.",
        code: `import std/strutils

let doc = """
  This is a multi-line string.
  It preserves newlines.
  """.unindent()

echo doc`
      }
    ]
  },
  {
    category: "System & Concurrency",
    items: [
      {
        name: "Spawn Task (Threadpool)",
        desc: "Quickly run a procedure on a separate thread.",
        code: `import std/threadpool

proc work(id: int) =
  echo "Working on ", id

spawn work(1)
spawn work(2)
sync()`
      },
      {
        name: "Async HTTP Fetch",
        desc: "Simple async GET request using std/asyncdispatch.",
        code: `import std/httpclient
import std/asyncdispatch

proc fetch() {.async.} =
  var client = newAsyncHttpClient()
  let response = await client.getContent("https://nim-lang.org")
  echo response[0..100]

waitFor fetch()`
      }
    ]
  }
];

export function buildGemsPanel(insertCallback) {
  const container = document.createElement('div')
  container.className = 'sb-panel-inner'
  
  const hdr = document.createElement('div')
  hdr.className = 'sb-hdr'
  hdr.innerHTML = '<span class="sb-title">NIM TREASURE MAP</span>'
  container.appendChild(hdr)

  const body = document.createElement('div')
  body.className = 'ref-body'
  body.style.padding = '0'

  GEMS.forEach(cat => {
    const catHdr = document.createElement('div')
    catHdr.className = 'ref-sect-hdr'
    catHdr.textContent = `> ${cat.category}`
    
    const catBody = document.createElement('div')
    catBody.className = 'ref-sect-body'
    catBody.style.padding = '4px 0 12px'

    cat.items.forEach(gem => {
      const row = document.createElement('div')
      row.className = 'build-step-row'
      row.style.padding = '8px 12px'
      row.innerHTML = `
        <div class="build-step-info">
          <span class="build-step-name">${gem.name}</span>
          <span class="build-step-desc">${gem.desc}</span>
        </div>
        <button class="build-step-run" title="Insert gem into editor">Insert</button>
      `
      row.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation()
        insertCallback(gem.code)
      })
      row.addEventListener('click', () => {
         // Show a small preview or just insert? Let's insert for speed.
         insertCallback(gem.code)
      })
      catBody.appendChild(row)
    })

    catHdr.addEventListener('click', () => {
      catBody.classList.toggle('hidden')
    })

    body.appendChild(catHdr)
    body.appendChild(catBody)
  })

  container.appendChild(body)
  return container
}
