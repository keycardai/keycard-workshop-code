import { requireBearerAuth } from "@keycardai/mcp/server/auth/middleware/bearerAuth";
import { mcpAuthMetadataRouter } from "@keycardai/mcp/server/auth/router";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerTools } from "./tools/index.js";

/** Read a required env var, failing with a useful message instead of a cryptic error later. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env and fill in the workshop values.`);
  }
  return value;
}

// The Keycard zone that issues and verifies tokens, and this server's own
// resource URI. KEYCARD_URL is the zone's issuer; MCP_RESOURCE_URL must match
// the resource registered in the zone exactly, /mcp path included.
const KEYCARD_URL = requireEnv("KEYCARD_URL");
const MCP_RESOURCE_URL = requireEnv("MCP_RESOURCE_URL");

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

// Advertise how to authenticate (RFC 9728 protected-resource metadata at
// /.well-known/oauth-protected-resource). When an agent hits /mcp without a
// token, the 401 below points it here, and here points it at the zone to get one.
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata: { issuer: KEYCARD_URL },
    scopesSupported: ["read", "issues:create"],
    resourceName: "Support Escalation MCP",
  }),
);

// Require a valid Keycard-issued bearer token on /mcp. `issuers` rejects tokens
// from anywhere but our zone; `audiences` binds the token's `aud` to this exact
// resource, so a token minted for some other resource in the zone can't be
// replayed here. Anonymous requests get a 401 with a pointer to the metadata above.
//
// We advertise the downstream Linear scopes (above) but don't pass `requiredScopes`
// here: issuer + audience already close the open-endpoint hole, and the advertised
// scopes ride the consent chain to the app's dependencies. Scope enforcement happens
// at a different gate: zone policy caps what each token exchange may request.
app.post(
  "/mcp",
  requireBearerAuth({ issuers: KEYCARD_URL, audiences: MCP_RESOURCE_URL }),
  async (req, res) => {
    // Stateless Streamable HTTP: every POST gets a fresh server + transport,
    // so there are no sessions to track (or leak) between requests.
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
  },
);

// Stateless server: we only speak POST /mcp. Tell GET (the server->client SSE
// stream) and DELETE (session teardown) callers so explicitly with a 405 — the
// spec-correct "POST-only" signal. Without it Express 404s, and strict clients
// (e.g. Cursor) treat the dead GET stream as a fatal transport error and give up.
// Registered without requireBearerAuth: a transport-capability probe shouldn't
// need a token.
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
