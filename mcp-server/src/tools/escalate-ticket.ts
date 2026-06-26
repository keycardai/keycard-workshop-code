import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createIssue } from "../linear.js";
import { getTicket } from "../tickets.js";

/**
 * Register the `escalate_ticket` tool: support → engineering handoff.
 *
 * Right now this copies the ticket VERBATIM into Linear — body, customer
 * contact details, everything. Engineering's issue tracker is outside the
 * support compliance boundary, so this is a PII leak. Later in the workshop
 * an LLM masks the ticket before it crosses over.
 */

/**
 * Map the customer-reported severity to a Linear priority (0 none, 1 urgent … 4 low).
 * This is a deterministic lookup, not an LLM call: the input is already a structured
 * enum, so a table is simpler, faster, and can't return an invalid value. (In Ch.5 the
 * LLM earns its place on a real classification task — assigning issue *labels*.)
 */
const PRIORITY_BY_SEVERITY = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
} as const;

export function registerEscalateTicket(server: McpServer): void {
  server.registerTool(
    "escalate_ticket",
    {
      title: "Escalate ticket to engineering",
      description:
        "Escalate a customer support ticket to the engineering team by creating a Linear issue from it. " +
        "Use this when a ticket needs an engineering fix rather than a support workaround.",
      inputSchema: {
        ticketId: z.string().uuid().describe("UUID of the support ticket to escalate"),
      },
      outputSchema: {
        ticketId: z.string().uuid(),
        issueId: z.string().describe("Linear issue ID (use with delete_issue)"),
        identifier: z.string().describe("Human-readable issue identifier, e.g. ENG-123"),
        url: z.string().describe("Link to the created Linear issue"),
      },
    },
    async ({ ticketId }) => {
      const ticket = getTicket(ticketId);
      if (!ticket) {
        throw new Error(`No support ticket found with id ${ticketId}`);
      }

      const title = `[support-escalation] ${ticket.subject}`;
      const description = [
        ticket.body,
        "---",
        `**Customer:** ${ticket.customer_name} (${ticket.email}, ${ticket.phone})`,
        `**Plan:** ${ticket.plan_tier} · **Severity:** ${ticket.severity}`,
        `**Support ticket:** ${ticket.id}`,
      ].join("\n\n");

      const priority = PRIORITY_BY_SEVERITY[ticket.severity];
      const issue = await createIssue(title, description, priority);

      const result = {
        ticketId: ticket.id,
        issueId: issue.id,
        identifier: issue.identifier,
        url: issue.url,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
