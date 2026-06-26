-- Workshop seed: the support_tickets datastore.
--
-- Run this once in the Supabase SQL Editor on the project the workshop uses.
-- In the workshop room the instructor has already done this; you only need
-- it if you're running your own Supabase project.
--
-- The five tickets are the same five (same UUIDs) that earlier checkpoints
-- shipped as data/tickets.json. All customer data is fake: .example/.test
-- emails, 555-01xx phones, 900-xx-xxxx SSNs, gateway test cards.

create table if not exists public.tickets (
  id uuid primary key,
  created_at timestamptz not null,
  customer_name text not null,
  email text not null,
  phone text not null,
  plan_tier text not null check (plan_tier in ('free', 'pro', 'enterprise')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null check (status in ('open', 'in_progress', 'closed')),
  subject text not null,
  body text not null
);

-- RLS on, with no policies: the anon and authenticated roles can read nothing.
-- Only a secret API key (sb_secret_…, which runs as service_role and bypasses
-- RLS) can see these rows — that's the credential the server obtains per
-- request through Keycard's vault.
alter table public.tickets enable row level security;

insert into public.tickets (id, created_at, customer_name, email, phone, plan_tier, severity, status, subject, body) values
(
  '3f9a2b1c-7d4e-4a8b-9c6f-1e2d3a4b5c6d',
  '2026-06-02T14:23:00Z',
  'Marisol Vexley',
  'marisol.vexley@acme-corp.example',
  '555-0142',
  'enterprise',
  'critical',
  'open',
  'Payment portal charges card twice on retry',
  $body$We got charged twice for invoice INV-8841. The payment page timed out, so I tried again, and now there are two of the same charges on my card. I already filled out your refund verification form once and nothing happened, so here it is again:

Name: Marisol Vexley
Card: 4242 4242 4242 4242 (Visa, exp 12/28)
SSN (identity check): 900-12-3456
Billing address: 1184 Corvid Lane, Apt 4B, New Carthage, OH 44199

You need to refund the second charge today, please. Our finance team reconciles on Fridays and this is going to get flagged!!$body$
),
(
  '8c1d4e7f-2a5b-4c9d-8e1f-6a7b8c9d0e1f',
  '2026-06-03T09:11:00Z',
  'Dashiell Okonkwo-Brandt',
  'd.okonkwo.brandt@globex.test',
  '555-0117',
  'pro',
  'high',
  'open',
  'Webhook deliveries silently stopped after region migration',
  $body$Our webhooks stopped working sometime around June 2 and we didn't notice for 3 days because nothing errored, they just stopped. Nothing changed on our end. The only thing that changed at all since then is your team migrated our account to eu-west that week. Endpoint is https://hooks.globex.test/ingest. I'm pasting our config from the dashboard in case something got dropped in the migration: signing secret whsec_test_565862673125, all event types enabled. Can someone check whether your side is still sending webhook events to our endpoint at all, or if they started failing silently after the migration?$body$
),
(
  'b5e8f0a3-9c2d-4e6f-a1b4-3c5d7e9f0a2b',
  '2026-06-04T16:47:00Z',
  'Petronella Quist',
  'pquist@initech.example',
  '555-0186',
  'free',
  'medium',
  'open',
  'CSV export truncates rows above 10k',
  $body$The CSV export keeps cutting off my data. I export my full contact list and the file always ends at exactly row 10K. There are no errors or warnings at all. Heres the last two rows of yesterdays' file:

9999, jdoe@customer-corp.example, active, 2026-05-30
10000, fbarnes@customer-corp.example, active, 2026-05-30

There should be about 14K rows. Exactly 10,000 feels like a limit somewhere on your side?$body$
),
(
  'd2c6a9e4-1f3b-4d7c-b8e0-5a6f8c0d2e4b',
  '2026-06-05T11:02:00Z',
  'Bartholomew Cole',
  'bart.cole@umbrella-labs.test',
  '555-0163',
  'enterprise',
  'high',
  'in_progress',
  'SSO login loops back to sign-in page',
  $body$I can't get past your SSO. I pick our idp, log in fine on our side, and your site bounces me straight back to the login page over and over. Your support chat asked me for a HAR file so that's attached. The looping request looks like this, if it helps: authorization: Bearer eyJhbGciOiJub25lIn0.lkjdfg89alkjeoit.lqwoinvo9. the RelayState in the callback is just empty. I tried two different browsers and incognito, and get this same loop every time.$body$
),
(
  'f7b3d5c8-4e0a-4b2d-9f6e-8c1a3b5d7e9f',
  '2026-06-06T08:30:00Z',
  'Ottoline Vance',
  'ottoline.vance@hooli.example',
  '555-0199',
  'pro',
  'low',
  'open',
  'Dark mode resets to light on every deploy',
  $body$Every time you ship an update, my theme flips back to light mode and I have to turn dark mode on again. This has happened after all of the last three releases. It's small but annoying because it keeps happening. Please fix, thanks!$body$
)
on conflict (id) do nothing;
