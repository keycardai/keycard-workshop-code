import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

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

/** Load all support tickets from the local datastore. */
export function loadTickets(): Ticket[] {
  // Resolved from the server folder (wherever you run `npm run dev`/`start`),
  // so the same path works in dev (tsx) and in the compiled build (dist).
  const raw = readFileSync(resolve(process.cwd(), "data/tickets.json"), "utf-8");
  return z.array(TicketSchema).parse(JSON.parse(raw));
}

/** Look up a single ticket by UUID, or undefined if it doesn't exist. */
export function getTicket(ticketId: string): Ticket | undefined {
  return loadTickets().find((ticket) => ticket.id === ticketId);
}
