/**
 * The server's connection to Keycard: per-request token exchange (RFC 8693).
 *
 * Every downstream credential is obtained fresh, per tool call, with the
 * caller's own bearer token as the subject. The subject token is what makes
 * the exchange *theirs*: Keycard records who asked and for which resource,
 * then answers with a credential for exactly that. Nothing returned here is
 * ever cached; Keycard owns the secret's lifecycle, the server borrows it
 * for one call.
 */
import { AuthProvider } from "@keycardai/mcp/server/auth/provider";
import { ClientSecret } from "@keycardai/mcp/server/auth/credentials";

/** Read a required env var, failing with a useful message instead of a cryptic error later. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env and fill in the workshop values.`);
  }
  return value;
}

// The application's own credentials (console → your application → Application
// Credentials). These authenticate the *app* to your zone's token endpoint, so
// Keycard knows which registered application is asking before it honors an
// exchange. They identify the server; the subject token identifies the caller.
// APP_CLIENT_ID is exported so the escalation can stamp which app filed an issue.
export const APP_CLIENT_ID = requireEnv("KEYCARD_CLIENT_ID");

// AuthProvider is the SDK's token-exchange orchestrator: hand it the zone and
// the app's credential once, and every exchange goes through it. We deliberately
// don't reach for the lower-level TokenExchangeClient — AuthProvider is the
// canonical surface, and it's what carries `requestScopes` (below).
// Exported so keycard.test.ts can stub `exchangeTokens` (no live zone in tests).
export const authProvider = new AuthProvider({
  zoneUrl: requireEnv("KEYCARD_URL"),
  applicationCredential: new ClientSecret(APP_CLIENT_ID, requireEnv("KEYCARD_CLIENT_SECRET")),
});

/**
 * Exchange the caller's bearer token for a credential for one resource.
 *
 * `resource` must exactly match the identifier registered in the zone:
 * Keycard resolves the audience by exact string comparison, so a trailing
 * slash or missing path means `invalid_target`, not a fuzzy match.
 *
 * For a vault resource the returned credential IS the stored secret; for an
 * OAuth resource it's a delegated access token. The call site can't tell
 * the difference, and that's the point.
 *
 * `scope` is what this call is asking permission for, passed as the exchange's
 * `requestScopes` and named on the wire (space-separated). Vault exchanges don't
 * take one; OAuth exchanges should request exactly what the calling tool needs,
 * no more — the request is recorded in the audit log and is what zone policy gets
 * to allow or deny.
 *
 * `exchangeTokens` returns an AccessContext keyed by resource; `.access(resource)`
 * hands back that resource's token or throws if the exchange failed — so a denied
 * scope or bad target surfaces here as an error, never as a silently-empty token.
 */
export async function exchangeForCredential(
  subjectToken: string,
  resource: string,
  scope?: string,
): Promise<string> {
  const accessContext = await authProvider.exchangeTokens(
    subjectToken,
    resource,
    scope ? { requestScopes: scope } : undefined,
  );
  return accessContext.access(resource).accessToken;
}
