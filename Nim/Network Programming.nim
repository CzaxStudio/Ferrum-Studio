# network.nim - TCP/IP networking examples
import std/[net, asyncdispatch, asyncnet, strutils, json]

# Simple TCP server (synchronous)
proc simpleTCPServer(port: int) =
  var server = newSocket()
  server.bindAddr(port.Port)
  server.listen()
  
  echo "Server listening on port ", port
  
  while true:
    let client = server.accept()
    echo "Client connected from ", client.getPeerAddr()[0]
    
    let message = client.recvLine()
    echo "Received: ", message
    
    client.send("Server echo: " & message & "\c\l")
    client.close()

# Simple TCP client
proc simpleTCPClient(serverAddr: string, port: int, message: string) =
  var client = newSocket()
  client.connect(serverAddr, port.Port)
  
  client.send(message & "\c\l")
  let response = client.recvLine()
  echo "Server response: ", response
  
  client.close()

# Async HTTP server
proc asyncHTTPServer(port: int) {.async.} =
  var server = newAsyncSocket()
  server.bindAddr(port.Port)
  server.listen()
  
  echo "Async HTTP server running on http://localhost:", port
  
  while true:
    let client = await server.accept()
    echo "New connection from ", client.getPeerAddr()[0]
    
    # Handle each connection concurrently
    asyncCheck handleClient(client)

proc handleClient(client: AsyncSocket) {.async.} =
  let request = await client.recv(4096)
  
  if request.len > 0:
    let response = "HTTP/1.1 200 OK\r\n" &
                   "Content-Type: text/html\r\n" &
                   "Connection: close\r\n\r\n" &
                   "<html><body>" &
                   "<h1>Hello from Nim!</h1>" &
                   "<p>Request received: " & request.split("\r\n")[0] & "</p>" &
                   "</body></html>"
    
    await client.send(response)
  
  await client.close()

# JSON API client
import std/httpclient

proc fetchJSONData(url: string): JsonNode =
  let client = newHttpClient()
  defer: client.close()
  
  try:
    let response = client.get(url)
    if response.status == "200 OK":
      result = parseJson(response.body)
    else:
      echo "HTTP error: ", response.status
      result = newJObject()
  except:
    echo "Connection error: ", getCurrentExceptionMsg()
    result = newJObject()

proc apiExample() =
  # Example using JSONPlaceholder API
  let userData = fetchJSONData("https://jsonplaceholder.typicode.com/users/1")
  
  if userData.kind != JObject:
    echo "Failed to fetch data"
    return
  
  echo "User Info:"
  echo "Name: ", userData["name"].getStr()
  echo "Email: ", userData["email"].getStr()
  echo "Phone: ", userData["phone"].getStr()
  echo "Website: ", userData["website"].getStr()

# UDP chat server
type
  ChatServer = ref object
    socket: Socket
    clients: seq[string]

proc startUDPServer(port: int) =
  var server = newSocket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
  server.bindAddr(port.Port)
  
  echo "UDP Chat Server on port ", port
  echo "Waiting for messages..."
  
  var buffer: array[1024, char]
  
  while true:
    let (bytes, addr) = server.recvFrom(addr(buffer), buffer.len)
    let message = newString(bytes)
    echo $addr[0] & ":" & $addr[1] & " -> " & message
    
    # Echo back
    server.sendTo(message, addr[0], addr[1].Port)

# WebSocket client example
import std/websocket

proc websocketExample() =
  var ws = newWebSocket("wss://echo.websocket.org")
  defer: ws.close()
  
  echo "Connected to WebSocket server"
  
  ws.send("Hello from Nim!")
  let response = ws.receiveString()
  echo "Server echoed: ", response

# Simple HTTP downloader
proc downloadFile(url: string, filename: string) =
  let client = newHttpClient()
  defer: client.close()
  
  echo "Downloading ", url
  
  try:
    let response = client.get(url)
    if response.status == "200 OK":
      writeFile(filename, response.body)
      echo "Saved to ", filename, " (", response.body.len, " bytes)"
    else:
      echo "Failed: ", response.status
  except:
    echo "Download error: ", getCurrentExceptionMsg()

# URL shortener (using custom API)
proc shortenURL(longURL: string): string =
  let client = newHttpClient()
  defer: client.close()
  
  try:
    let response = client.post("https://tinyurl.com/api-create.php",
                               body = "url=" & encodeUrl(longURL))
    result = response.body.strip()
    echo "Short URL: ", result
  except:
    echo "Failed to shorten URL"
    result = longURL

# Run examples (uncomment which ones to test)
proc runExamples() =
  echo "=== Network Programming Examples ===\n"
  
  # API example
  echo "API Client Example:"
  apiExample()
  
  echo "\nURL Shortener:"
  let short = shortenURL("https://nim-lang.org/docs.html")
  
  echo "\nDownload Example:"
  # downloadFile("https://nim-lang.org/download/nim-2.0.0_x64.zip", "nim.zip")
  
  echo "\nWebSocket Example:"
  websocketExample()
  
  # Uncomment for server examples (run in separate terminal)
  # asyncHTTPServer(8080)  # Run async server
  # simpleTCPServer(8000)   # Run TCP server
  # startUDPServer(9000)    # Run UDP server

# For async server
when isMainModule:
  # For demo, run async server in background
  echo "Starting examples (Servers require separate terminals)"
  runExamples()
  # waitFor asyncHTTPServer(8080)  # Uncomment to run server