import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDeleteIssue } from "./delete-issue.js";
import { registerEscalateTicket } from "./escalate-ticket.js";
import { registerGetTickets } from "./get-tickets.js";

/** Register all workshop tools on the server. */
export function registerTools(server: McpServer): void {
  registerGetTickets(server);
  registerEscalateTicket(server);
  registerDeleteIssue(server);
}
