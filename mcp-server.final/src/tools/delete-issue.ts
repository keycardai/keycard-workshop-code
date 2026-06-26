import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trashIssue } from "../linear.js";

/** Register the `delete_issue` tool: remove an escalation that engineering doesn't need. */
export function registerDeleteIssue(server: McpServer): void {
  server.registerTool(
    "delete_issue",
    {
      title: "Delete Linear issue",
      description:
        "Move a Linear issue to the trash. Use this to withdraw an escalation that was " +
        "created by mistake or is no longer needed.",
      inputSchema: {
        issueId: z.string().describe("Linear issue ID, as returned by escalate_ticket"),
      },
      outputSchema: {
        success: z.boolean(),
        issueId: z.string(),
      },
    },
    async ({ issueId }, extra) => {
      // requireBearerAuth already verified the caller's token; the Linear
      // exchange happens as that caller.
      const auth = extra.authInfo;
      if (!auth) {
        throw new Error("Request has no auth info — is requireBearerAuth mounted on /mcp?");
      }

      await trashIssue(issueId, auth);

      const result = { success: true, issueId };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
