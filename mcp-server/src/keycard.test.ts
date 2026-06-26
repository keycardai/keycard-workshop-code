/**
 * The token-exchange seam: does exchangeForCredential thread the per-tool
 * scope through to the SDK as `requestScopes`, return the resource's token,
 * and fail loudly when an exchange fails? These are the properties the
 * AuthProvider migration could silently break (a dropped scope = the wrong
 * privilege requested with no error), so they're what we pin.
 *
 * No live zone: we stub authProvider.exchangeTokens. Run with `npm test`.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

// keycard.ts builds its AuthProvider from env at import time, so give it
// dummy non-empty values. The SDK creates its HTTP client lazily (only inside
// exchangeTokens), so importing here touches no network — and we replace
// exchangeTokens before any call runs anyway.
process.env.KEYCARD_URL = "https://test.invalid";
process.env.KEYCARD_CLIENT_ID = "test-client";
process.env.KEYCARD_CLIENT_SECRET = "test-secret";

const { exchangeForCredential, authProvider } = await import("./keycard.js");

/**
 * Stand-in for the AccessContext the real exchangeTokens returns. `access`
 * yields a token when one was issued, or throws — mirroring the SDK's
 * ResourceAccessError on a failed/missing exchange.
 */
function fakeContext(token: string | undefined) {
  return {
    access(resource: string) {
      if (token === undefined) throw new Error(`no token for ${resource}`);
      return { accessToken: token };
    },
  };
}

// The stub ignores its args (we assert on them via mock.calls) and returns a
// canned context. `as any`: a hand-rolled AccessContext can't satisfy the
// class's private fields, and this file is excluded from tsc — runtime only.
const stubExchange = (ctx: ReturnType<typeof fakeContext>) =>
  mock.method(authProvider, "exchangeTokens", async () => ctx as any);

test("threads a tool's scope through as requestScopes and returns its token", async () => {
  const m = stubExchange(fakeContext("tok-read"));
  const token = await exchangeForCredential("subject-abc", "https://linear.app", "read");

  assert.equal(token, "tok-read");
  const [subjectToken, resource, options] = m.mock.calls[0].arguments;
  assert.equal(subjectToken, "subject-abc");
  assert.equal(resource, "https://linear.app");
  // The least-privilege scope must reach the wire as requestScopes — the whole
  // point of Ch.6/7. A regression here would silently request the wrong scope.
  assert.deepEqual(options, { requestScopes: "read" });
  m.mock.restore();
});

test("sends no requestScopes for a scopeless (vault) exchange", async () => {
  const m = stubExchange(fakeContext("vault-secret"));
  const token = await exchangeForCredential("subject-abc", "https://project.supabase.co");

  assert.equal(token, "vault-secret");
  // Vault exchanges name no scope: options must be omitted entirely, not {}.
  assert.equal(m.mock.calls[0].arguments[2], undefined);
  m.mock.restore();
});

test("propagates a failed exchange as a throw, never a silent empty token", async () => {
  const m = stubExchange(fakeContext(undefined));
  await assert.rejects(
    () => exchangeForCredential("subject-abc", "https://linear.app", "write"),
    /no token for/,
  );
  m.mock.restore();
});
