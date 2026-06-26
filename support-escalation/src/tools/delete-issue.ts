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
    async ({ issueId }) => {
      await trashIssue(issueId);

      const result = { success: true, issueId };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
