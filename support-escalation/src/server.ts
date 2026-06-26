import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerTools } from "./tools/index.js";

/** Build a fresh MCP server with the workshop tools registered. */
function buildServer(): McpServer {
  const server = new McpServer({
    name: "support-escalation",
    version: "0.1.0",
  });
  registerTools(server);
  return server;
}

const app = express();
app.use(express.json());

// Stateless Streamable HTTP: every POST gets a fresh server + transport,
// so there are no sessions to track (or leak) between requests.
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless server: we only speak POST /mcp. Tell GET (the server->client SSE
// stream) and DELETE (session teardown) callers so explicitly with a 405 — the
// spec-correct "POST-only" signal. Without it Express 404s, and strict clients
// (e.g. Cursor) treat the dead GET stream as a fatal transport error and give up.
const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).set("Allow", "POST").json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed: stateless server, use POST /mcp" },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(process.env.PORT || 8000);
app.listen(port, () => {
  console.log(`Support escalation MCP server running at http://localhost:${port}/mcp`);
});
