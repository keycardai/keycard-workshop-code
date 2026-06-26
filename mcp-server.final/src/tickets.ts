import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { exchangeForCredential } from "./keycard.js";

/**
 * A customer support ticket. Structured fields are tame; the free-text
 * `body` is where support agents paste everything the customer told them —
 * including PII that has no business leaving this system.
 */
export const TicketSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  customer_name: z.string(),
  email: z.string(),
  phone: z.string(),
  plan_tier: z.enum(["free", "pro", "enterprise"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "in_progress", "closed"]),
  subject: z.string(),
  body: z.string(),
});

export type Ticket = z.infer<typeof TicketSchema>;

/** Read a required env var, failing with a useful message instead of a cryptic error later. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env and fill in the workshop values.`);
  }
  return value;
}

// The Supabase project URL does double duty: it's where supabase-js sends
// queries, and it's the resource identifier registered in your Keycard zone,
// the exact string the exchange names to say which credential it wants.
const SUPABASE_URL = requireEnv("SUPABASE_URL");

/**
 * Build a Supabase client for this one request, on behalf of the caller.
 *
 * The secret API key never appears in .env and never outlives the request:
 * we exchange the caller's verified bearer token for it, query with it, and
 * let it go out of scope. Each exchange is one `credentials:issue` event in
 * the zone's audit log, which is how every tool call ends up attributed to
 * the human behind it.
 */
async function supabaseForCaller(auth: AuthInfo) {
  const secretKey = await exchangeForCredential(auth.token, SUPABASE_URL);
  // A throwaway server-side client: no session to persist or refresh.
  return createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Load all support tickets from the datastore, as the calling user. */
export async function loadTickets(auth: AuthInfo): Promise<Ticket[]> {
  const supabase = await supabaseForCaller(auth);
  const { data, error } = await supabase.from("tickets").select().order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return z.array(TicketSchema).parse(data);
}

/** Look up a single ticket by UUID (as the calling user), or undefined if it doesn't exist. */
export async function getTicket(ticketId: string, auth: AuthInfo): Promise<Ticket | undefined> {
  const supabase = await supabaseForCaller(auth);
  const { data, error } = await supabase.from("tickets").select().eq("id", ticketId).maybeSingle();
  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return data ? TicketSchema.parse(data) : undefined;
}
