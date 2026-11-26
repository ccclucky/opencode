import { createInterface } from "node:readline"

// A 2026-07-28 server that moves the connection to that era when it reads the auto probe, so a
// legacy initialize on the same connection is refused. A connection that starts with initialize
// negotiates legacy, which the server also serves.
const send = (message: unknown) => process.stdout.write(JSON.stringify(message) + "\n")
let probed = false

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  const message = JSON.parse(line)
  if (message.id === undefined || message.method === undefined) continue
  if (message.method === "server/discover") {
    probed = true
    continue
  }
  if (message.method === "initialize") {
    if (probed) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32022,
          message: "connection is serving the 2026-07-28 protocol; the initialize handshake is not accepted",
          data: { supported: ["2026-07-28"], requested: message.params?.protocolVersion },
        },
      })
      continue
    }
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "probed-modern", version: "1.0.0" },
      },
    })
  }
  if (message.method === "tools/list")
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", inputSchema: { type: "object" } }] } })
}
