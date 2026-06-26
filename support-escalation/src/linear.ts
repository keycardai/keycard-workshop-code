/**
 * A minimal Linear client: two GraphQL mutations over plain fetch.
 *
 * Credential acquisition is deliberately isolated at the top of each
 * function. Right now it's a shared, over-permissioned personal API key
 * pulled from .env. Later in the workshop we swap *only* that part for a
 * per-user, least-privilege token from Keycard; the GraphQL calls below
 * don't change.
 */

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/** Read a required env var, failing with a useful message instead of a cryptic 401 later. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env and fill in the workshop values.`);
  }
  return value;
}

/** POST a GraphQL operation to Linear and return the `data` payload. */
async function linearRequest<T>(apiKey: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Personal API keys are sent bare (no "Bearer" prefix).
      Authorization: apiKey,
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

/** Create a Linear issue in the workshop team. `priority` is a Linear priority int (0 none, 1 urgent … 4 low). */
export async function createIssue(title: string, description: string, priority: number): Promise<CreatedIssue> {
  const apiKey = requireEnv("LINEAR_API_KEY");
  const teamId = requireEnv("LINEAR_TEAM_ID");

  const data = await linearRequest<{
    issueCreate: { success: boolean; issue: CreatedIssue | null };
  }>(
    apiKey,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    { input: { teamId, title, description, priority } },
  );

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Linear did not create the issue");
  }
  return data.issueCreate.issue;
}

/** Move a Linear issue to the trash. */
export async function trashIssue(issueId: string): Promise<void> {
  const apiKey = requireEnv("LINEAR_API_KEY");

  const data = await linearRequest<{ issueDelete: { success: boolean } }>(
    apiKey,
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
