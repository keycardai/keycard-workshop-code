import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createIssue, getLabelIds } from "../linear.js";
import { EntityTypeSchema, maskTicket } from "../pii.js";
import { getTicket } from "../tickets.js";

/**
 * Map the customer-reported severity to a Linear priority (0 none, 1 urgent … 4 low).
 * This is a deterministic lookup, not an LLM call: the input is already a structured
 * enum, so a table is simpler, faster, and can't return an invalid value. The LLM
 * earns its place one step over, on a real classification task — assigning issue
 * labels (see src/pii.ts).
 */
const PRIORITY_BY_SEVERITY = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
} as const;

/**
 * Register the `escalate_ticket` tool: support → engineering handoff.
 *
 * Nothing customer-typed crosses the boundary as-is anymore. An LLM
 * rewrites the ticket first (src/pii.ts): a fresh engineering-facing
 * title, the body with PII replaced by placeholders, and labels. The
 * issue that lands in Linear carries that rewritten content, non-PII
 * metadata, and the ticket UUID; anyone who legitimately needs the
 * customer's identity follows the UUID back into the support system,
 * where PII is allowed to live. Linear itself still gets the shared god
 * key for one more chapter.
 */
export function registerEscalateTicket(server: McpServer): void {
  server.registerTool(
    "escalate_ticket",
    {
      title: "Escalate ticket to engineering",
      description:
        "Escalate a customer support ticket to the engineering team by creating a Linear issue from it. " +
        "The escalation is sanitized server-side before posting: the issue gets an engineering-facing " +
        "title, a body with PII replaced by placeholders, and labels, all generated automatically. Use " +
        "this when a ticket needs an engineering fix rather than a support workaround.",
      inputSchema: {
        ticketId: z.string().uuid().describe("UUID of the support ticket to escalate"),
      },
      outputSchema: {
        ticketId: z.string().uuid(),
        issueId: z.string().describe("Linear issue ID (use with delete_issue)"),
        identifier: z.string().describe("Human-readable issue identifier, e.g. ENG-123"),
        url: z.string().describe("Link to the created Linear issue"),
        maskedText: z.string().describe("The ticket body as it was posted to Linear, PII masked"),
        detectedEntities: z
          .array(z.object({ type: EntityTypeSchema, placeholder: z.string() }))
          .describe("What was masked: types and placeholders only, never the original values"),
      },
    },
    async ({ ticketId }, extra) => {
      // requireBearerAuth verified the caller's token back in Chapter 2.
      // Both exchanges in this tool — the datastore read and the masking
      // call — happen as that caller.
      const auth = extra.authInfo;
      if (!auth) {
        throw new Error("Request has no auth info — is requireBearerAuth mounted on /mcp?");
      }

      const ticket = await getTicket(ticketId, auth);
      if (!ticket) {
        throw new Error(`No support ticket found with id ${ticketId}`);
      }

      // Rewrite the ticket before it crosses the boundary. Past this line,
      // nothing downstream ever sees the raw ticket.
      const masked = await maskTicket(ticket.subject, ticket.body, auth);

      // The "[case]" prefix is deterministic code, like the priority table;
      // the title text is the model's case summary — judgment, like labels.
      const title = `[case] ${masked.title}`;
      // Masked body + non-PII metadata + the ticket UUID. The customer's
      // contact fields stay behind in the support system, where they belong.
      const description = [
        masked.maskedText,
        "---",
        `**Plan:** ${ticket.plan_tier} · **Severity:** ${ticket.severity}`,
        `**Support ticket:** ${ticket.id}`,
      ].join("\n\n");

      const priority = PRIORITY_BY_SEVERITY[ticket.severity];
      const labelIds = await getLabelIds(masked.labels);
      const issue = await createIssue(title, description, priority, labelIds);

      const result = {
        ticketId: ticket.id,
        issueId: issue.id,
        identifier: issue.identifier,
        url: issue.url,
        maskedText: masked.maskedText,
        detectedEntities: masked.detectedEntities,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
