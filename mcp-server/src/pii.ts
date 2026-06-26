/**
 * PII masking + issue titling + classification, in one structured LLM call.
 *
 * This is the server-side fix for the content leak: nothing customer-typed
 * crosses the compliance boundary into Linear as-is. The ticket body is
 * rewritten with every piece of PII replaced by a placeholder, and the
 * issue title is written fresh — an engineering-facing summary of the
 * problem, the way a support engineer would hand off a case, rather than a
 * redacted copy of the customer's subject line. The same call classifies
 * the issue against the workspace's label set. All three are judgment
 * calls over free text, which is what earns the model its place here.
 * (Priority stays a lookup table in escalate-ticket.ts — the model has no
 * business answering questions that already have deterministic answers.)
 *
 * The Anthropic API key is born vaulted: it never appears in .env. It's
 * exchanged per request from Keycard's vault, exactly like the Supabase
 * key in tickets.ts — same call, different credential coming back.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { NoObjectGeneratedError, NoOutputGeneratedError, Output, generateText } from "ai";
import { z } from "zod";
import { exchangeForCredential } from "./keycard.js";

// The Anthropic API base URL doubles as the vault resource identifier
// registered in your zone — exact string match, like every exchange.
const ANTHROPIC_API_URL = "https://api.anthropic.com";

/** The kinds of PII the masking pass looks for. */
export const EntityTypeSchema = z.enum([
  "NAME",
  "EMAIL",
  "PHONE",
  "SSN",
  "ADDRESS",
  "CREDIT_CARD",
  "CREDENTIAL",
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * The workspace's issue labels, exactly as they exist in Linear. The model
 * can only ever answer with names from this list; linear.ts resolves the
 * names to label IDs at runtime (Linear's API matches IDs, not names).
 */
const ISSUE_LABELS = [
  "payments",
  "webhooks",
  "data-export",
  "auth",
  "frontend",
  "api",
  "infrastructure",
  "notifications",
] as const;

const MaskResultSchema = z.object({
  title: z
    .string()
    .describe(
      "Concise engineering-facing title summarizing the technical problem; " +
        "never include names, contact details, or anything else that identifies the customer",
    ),
  maskedText: z
    .string()
    .describe("The full ticket body, rewritten with every piece of PII replaced by its placeholder"),
  detectedEntities: z
    .array(
      z.object({
        type: EntityTypeSchema,
        // The regex makes the no-raw-values rule a schema guarantee, not a
        // hope: an answer that puts an actual value here fails validation.
        placeholder: z
          .string()
          .regex(/^\[[A-Z_]+(_\d+)?\]$/)
          .describe('The placeholder used in maskedText, e.g. "[EMAIL_1]"'),
      }),
    )
    .describe("One entry per masked value: type and placeholder only, never the original value"),
  labels: z
    .array(z.enum(ISSUE_LABELS))
    .min(1)
    .max(3)
    .describe("One to three labels classifying the technical issue"),
});

export type MaskResult = z.infer<typeof MaskResultSchema>;

const SYSTEM_PROMPT = `You sanitize customer support tickets before they cross into engineering's issue tracker, which is not allowed to hold customer PII. You receive a ticket's subject and body.

Write a concise, engineering-facing title that summarizes the technical problem. A support engineer is handing this case to engineering: the title describes the malfunction, never the customer. Do not carry names, contact details, or anything else customer-identifying into it.

Rewrite the ticket body with every piece of personally identifiable information replaced by a bracketed placeholder: names, email addresses, phone numbers, social security numbers, postal addresses, payment card numbers, and credentials of any kind (passwords, API keys, tokens, signing secrets). Number placeholders of the same type ([EMAIL_1], [EMAIL_2]) so the text stays readable. PII often arrives inside pasted artifacts — forms, configs, CSV rows, request logs — so mask the values wherever they appear, but keep every technical detail intact: the symptoms are why this ticket is being escalated.

Report each masked value in detectedEntities as its type and placeholder only. Never repeat an original value anywhere in your output.

Then classify the issue with one to three labels. Where they border each other: "api" is inbound requests the customer makes to us, "webhooks" is outbound machine-to-machine events we send, "notifications" is outbound human-facing messages (email, SMS, push).`;

/**
 * Rewrite a ticket for the boundary crossing, as the calling user: a fresh
 * engineering-facing title, the body with PII masked, and 1–3 labels.
 *
 * Raw PII exists only inside this call: the unmasked ticket goes to the
 * model, and what comes back is shaped by the schema — the placeholder
 * format and label set are validated, not just requested.
 */
export async function maskTicket(subject: string, body: string, auth: AuthInfo): Promise<MaskResult> {
  // The same exchange as the datastore read, against a different resource.
  // The vault answers with Anthropic's static API key instead of a scoped
  // token — the call site can't tell, but the audit log records both.
  const apiKey = await exchangeForCredential(auth.token, ANTHROPIC_API_URL);
  // Pin the endpoint as well as the key. Left unset, the provider falls back
  // to an ambient ANTHROPIC_BASE_URL env var — and the shell a coding agent
  // launches this server from often has one. Nothing in this module should
  // come from the environment; the credential already doesn't.
  const anthropic = createAnthropic({ apiKey, baseURL: `${ANTHROPIC_API_URL}/v1` });

  try {
    const { output } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      system: SYSTEM_PROMPT,
      prompt: `Subject: ${subject}\n\n${body}`,
      output: Output.object({ schema: MaskResultSchema }),
    });
    return output;
  } catch (error) {
    // The SDK's errors carry the raw prompt and the raw (failed) model
    // output on the error object — never let those objects out of this
    // function, or into a log. Only a plain message leaves here.
    if (NoOutputGeneratedError.isInstance(error) || NoObjectGeneratedError.isInstance(error)) {
      throw new Error("PII masking failed: the model's answer was incomplete or didn't match the schema. Retry the escalation.");
    }
    throw new Error(`PII masking failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
