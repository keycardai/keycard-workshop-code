/**
 * The least-privilege contract: each Linear operation must request exactly
 * the scope it needs and no more — a read asks for `read`, issue creation for
 * `issues:create`, trashing for `write`. This is the heart of Ch.6/7, so it's
 * the thing most worth pinning against an accidental widening (e.g. someone
 * "simplifies" all three to `write`).
 *
 * We drive the real linear.ts functions. The scope each one requests is
 * captured at authProvider.exchangeTokens (where exchangeForCredential lands
 * it as `requestScopes`); fetch is stubbed so the GraphQL call completes
 * without a network. Run with `npm test`.
 */
import test, { mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// linear.ts and keycard.ts both read required env at import time; supply dummy
// non-empty values. No network results from importing (the SDK client is lazy,
// and we stub the exchange and fetch before calling anything).
process.env.KEYCARD_URL = "https://test.invalid";
process.env.KEYCARD_CLIENT_ID = "test-client";
process.env.KEYCARD_CLIENT_SECRET = "test-secret";
process.env.LINEAR_API_URL = "https://api.linear.app";
process.env.LINEAR_TEAM_ID = "team-123";

const { authProvider } = await import("./keycard.js");
const { getLabelIds, createIssue, trashIssue } = await import("./linear.js");

const auth = { token: "subject-token" } as AuthInfo;

/**
 * Stub the exchange and the Linear HTTP call, and return the scope that the
 * operation under test requested. `fetchBody` is the GraphQL `data` payload
 * the operation needs back to complete successfully.
 */
function stubExchangeAndFetch(fetchBody: unknown): () => string | undefined {
  let requestedScope: string | undefined;
  // exchangeForCredential calls authProvider.exchangeTokens(token, resource,
  // { requestScopes }) — capture that scope, hand back a throwaway token.
  mock.method(authProvider, "exchangeTokens", async (_t: string, resource: string, opts?: { requestScopes?: string }) => {
    requestedScope = opts?.requestScopes;
    return { access: () => ({ accessToken: "linear-token-for-" + resource }) } as any;
  });
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ data: fetchBody }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  return () => requestedScope;
}

afterEach(() => mock.restoreAll());

test("getLabelIds requests only `read`", async () => {
  const scope = stubExchangeAndFetch({ issueLabels: { nodes: [{ id: "label-1" }] } });
  const ids = await getLabelIds(["payments"], auth);

  assert.deepEqual(ids, ["label-1"]);
  assert.equal(scope(), "read");
});

test("createIssue requests only `issues:create`", async () => {
  const scope = stubExchangeAndFetch({
    issueCreate: { success: true, issue: { id: "iss-1", identifier: "ENG-1", url: "https://linear.app/iss-1" } },
  });
  const issue = await createIssue("title", "body", 2, ["label-1"], auth);

  assert.equal(issue.identifier, "ENG-1");
  assert.equal(scope(), "issues:create");
});

test("trashIssue requests only `write`", async () => {
  const scope = stubExchangeAndFetch({ issueDelete: { success: true } });
  await trashIssue("iss-1", auth);

  assert.equal(scope(), "write");
});
