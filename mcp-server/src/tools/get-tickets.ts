import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Ticket, TicketSchema, getTicket, loadTickets } from "../tickets.js";

/** Register the `get_support_tickets` tool: read access to the support ticket queue. */
export function registerGetTickets(server: McpServer): void {
  server.registerTool(
    "get_support_tickets",
    {
      title: "Get support tickets",
      description:
        "List open customer support tickets, or fetch a single ticket by its UUID. " +
        "Use this to review the support queue and decide which tickets need to be escalated to engineering.",
      inputSchema: {
        ticketId: z.string().uuid().optional().describe("Fetch one specific ticket by UUID; omit to list all tickets"),
      },
      outputSchema: {
        tickets: z.array(TicketSchema),
      },
    },
    async ({ ticketId }) => {
      let tickets: Ticket[];
      if (ticketId) {
        const ticket = getTicket(ticketId);
        if (!ticket) {
          throw new Error(`No support ticket found with id ${ticketId}`);
        }
        tickets = [ticket];
      } else {
        tickets = loadTickets();
      }

      // Both forms carry the same { tickets } shape: structuredContent for
      // clients that read the output schema, text for clients that don't.
      const result = { tickets };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
