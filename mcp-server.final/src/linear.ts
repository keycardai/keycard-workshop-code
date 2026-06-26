/**
 * A minimal Linear client: a few GraphQL operations over plain fetch.
 *
 * Credential acquisition is deliberately isolated at the top of each
 * function. The shared personal API key that used to live here is gone:
 * every function now exchanges the caller's token for a delegated Linear
 * credential, requesting only the scope its one operation needs. The
 * GraphQL calls themselves never changed.
 */
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { exchangeForCredential } from "./keycard.js";

/** Read a required env var, failing with a useful message instead of a cryptic error later. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env and fill in the workshop values.`);
  }
  return value;
}

// Linear's API origin doubles as the resource identifier registered in your
// zone — exact string match, like every exchange. Pinned from .env (like
// ANTHROPIC_API_URL), not hardcoded.
const LINEAR_API_URL = requireEnv("LINEAR_API_URL");
const LINEAR_GRAPHQL_URL = `${LINEAR_API_URL}/graphql`;

// Linear team to create escalation issues in. Config, not a credential —
// both it and LINEAR_API_URL live in .env.
const LINEAR_TEAM_ID = requireEnv("LINEAR_TEAM_ID");

/** POST a GraphQL operation to Linear and return the `data` payload. */
async function linearRequest<T>(accessToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // OAuth access tokens take the Bearer prefix (the old personal API
      // key was sent bare — that's how Linear tells them apart).
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API returned ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (result.errors?.length) {
    throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  if (!result.data) {
    throw new Error("Linear returned no data");
  }
  return result.data;
}

export interface CreatedIssue {
  id: string;
  identifier: string;
  url: string;
}

/**
 * Resolve workspace label names to Linear label IDs. Linear's issueCreate
 * matches labels by ID, not name, so the LLM's label names (see pii.ts)
 * get translated here, at the last moment before the issue is created.
 */
export async function getLabelIds(names: string[], auth: AuthInfo): Promise<string[]> {
  // A read asks for `read` — the narrowest Linear scope that authorizes the labels query.
  const accessToken = await exchangeForCredential(auth.token, LINEAR_API_URL, "read");

  const data = await linearRequest<{
    issueLabels: { nodes: { id: string }[] };
  }>(
    accessToken,
    `query LabelIds($names: [String!]!) {
      issueLabels(filter: { name: { in: $names } }) {
        nodes { id }
      }
    }`,
    { names },
  );

  return data.issueLabels.nodes.map((node) => node.id);
}

/** Create a Linear issue in the workshop team, attributed to the calling user. `priority` is a Linear priority int (0 none, 1 urgent … 4 low). */
export async function createIssue(
  title: string,
  description: string,
  priority: number,
  labelIds: string[],
  auth: AuthInfo,
): Promise<CreatedIssue> {
  // A Linear credential requested for exactly what this call does:
  // issues:create is a sibling of write, not a subset — the request is
  // recorded and policed on every exchange. This token acts as the calling
  // user, so Linear attributes the issue to them natively.
  const accessToken = await exchangeForCredential(auth.token, LINEAR_API_URL, "issues:create");

  const data = await linearRequest<{
    issueCreate: { success: boolean; issue: CreatedIssue | null };
  }>(
    accessToken,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    { input: { teamId: LINEAR_TEAM_ID, title, description, priority, labelIds } },
  );

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Linear did not create the issue");
  }
  return data.issueCreate.issue;
}

/** Move a Linear issue to the trash, as the calling user. */
export async function trashIssue(issueId: string, auth: AuthInfo): Promise<void> {
  // Trashing is an edit to an existing issue, which is write territory.
  const accessToken = await exchangeForCredential(auth.token, LINEAR_API_URL, "write");

  const data = await linearRequest<{ issueDelete: { success: boolean } }>(
    accessToken,
    `mutation TrashIssue($id: String!) {
      issueDelete(id: $id) {
        success
      }
    }`,
    { id: issueId },
  );

  if (!data.issueDelete.success) {
    throw new Error(`Linear did not trash issue ${issueId}`);
  }
}
