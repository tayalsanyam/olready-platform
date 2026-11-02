# OLReady platform

Multi-category wedding vendor marketplace built on OLReady's verified-lead model. Brides send one enquiry, Ops verifies it on a call, and verified vendors in each category unlock it with credits, chat, quote and report bookings.

Stack: Next.js 16 (App Router, server actions) · Postgres on Supabase (Mumbai) · Supabase Auth email codes · Tailwind 4 · Vercel (`bom1`).

## What is in it

| Milestone | What it does |
| --- | --- |
| M1 Vendors and categories | Category table with per-category fields, budget tiers, credit cost and unlock cap. Vendor onboarding, profile editor, work photos, Ops review, verified and assured tags, claim flow for Ops-built profiles. |
| M2 Multi-category leads | One enquiry creates one lead need per category. Three-stage verification call script that asks about every category. Credit ledger (plan vs top-up), unlock caps, reopen rounds (+10, max 2), fake-lead removal with per-vendor refunds, direct requests, conversations, quotes, booking reports with reporter-only rewards, packs and plans, Razorpay, PayU, bank transfer, gateway on/off switches, receipts. |
| M3 SEO pages | `/vendors/<city>/<category>/<filter>` pages generated from structured fields, FAQs written from data, JSON-LD (LocalBusiness, FAQPage, ItemList, Breadcrumb, Article), sitemap, robots, `llms.txt`, thin-page guard. |
| M4 Real Weddings | Submission with consent, vendor tagging and confirmation, Ops moderation, public pages that link every vendor. |
| M5 Bride tools | Wedding workspace, dated checklist, functions, guest list with personal RSVP links and WhatsApp share, e-invite page, shortlist with "ask all shortlisted", family members by join code. |
| M6 Reviews and disputes | Separate artist and service ratings, verified-booking tag, vendor replies, dispute queue with 48-hour contact and 7-day proof deadlines, auto-expiry, post-event feedback emails. |

| Relationship managers | Bride buys the RM service (pays first) or starts her booking perk; Ops approves and assigns an RM for 30 days or until the wedding; the RM sees her requests, shortlist, checklist and vendor chats (read only) while assigned, and keeps notes. |
| Photos and email | Vendor and real-wedding photos upload to Supabase Storage, shrunk in the browser and checked by file bytes. Event emails (new verified lead, message, quote, quote accepted, RM assigned, post-event feedback) go through a deduplicated outbox, with an on/off switch per person. |

Ops console: role-based (`ops`, `content`, `rm`, `admin`). Employees see queues but cannot download; only admins export CSV, and every export is logged. Every state change writes to `mkt.audit_log`.

## Decisions from the OLReady spec that this build follows

- Add-on schema only: everything lives in the `mkt` schema. The sales site's tables and the legacy Laravel data are untouched. RLS is on for every `mkt` table with no policies, and the schema is revoked from `anon`/`authenticated`, so the public API keys read nothing.
- Leads are verified, not exclusive. A lead reaching its cap waits for Ops to decide on reopening.
- Vendor phone, email and Instagram never reach the bride's browser. Phone sharing is not blocked once a conversation starts.
- A booking reported by either side counts. The reward goes only to the reporter: a bonus credit for vendors, 7 days of RM help within 60 days for brides.
- Plans (Pro, Phoenix, Privy) activate only after Ops adds the invoice and signed-contract links. Top-ups activate on payment. Pack changes apply to new purchases only.
- Top-up credits unlock any budget tier; plan credits follow the plan's tiers (tiers are infrastructure, not used by the default plans).
- Ops-built profiles stay private until the vendor claims them.
- Unverified migrated artists stay visible without the verified tag.

Prices, caps and credit costs in `supabase/seed/reference.sql` are starting defaults. Admins change them in Ops > Categories and Ops > Payments.

## Run it locally

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL to a local Postgres; DEV_AUTH=1
npm run db:reset                  # schema + reference data + fictional demo data
npm run dev                       # http://localhost:3000/dev-login to sign in as any demo person
npm test                          # 31 integration tests against the database
node tests/e2e/walkthrough.mjs    # 28-step UI walkthrough in headless Chrome at phone width
```

`DEV_AUTH` and the test payment gateway are refused when `NODE_ENV=production`.

## Deploy

1. **Database.** On the existing "Olready Website" Supabase project, run `DATABASE_URL=<pooler URI> npm run db:migrate`. It applies the migrations in `supabase/migrations` and loads reference data. It never drops anything without `--reset`, and `--reset` refuses to run in production.
2. **Auth.** Supabase > Authentication > Email: enable email OTP and put `{{ .Token }}` in the sign-in template. Add `/auth/confirm` as a redirect URL if you also want magic links.
3. **Vercel.** Import the repo, set the variables from `.env.example`, and keep the region `bom1`. `vercel.json` schedules `/api/cron/daily` (07:00 IST) for dispute expiry, feedback emails, plan expiry (unused plan credits are written off), RM engagements ending, and the email outbox; set `CRON_SECRET`. `proxy.ts` keeps Supabase sign-ins fresh.
4. **Photos.** Set `SUPABASE_SERVICE_ROLE_KEY` (server only). Migration 4 creates the public `olready-media` bucket.
5. **Payments.** Add Razorpay and PayU keys, point the Razorpay webhook at `/api/payments/razorpay/webhook` (events `payment.captured`, `order.paid`), then switch the gateways on in Ops > Payments.
6. **First admin.** Insert one profile with `role = 'admin'` and your email; signing in with that email links the account.
7. **Legacy artists.** Export artists from Laravel as CSV and run `node scripts/import-legacy.mjs artists.csv --dry-run`, then without `--dry-run`. Re-running updates instead of duplicating.

## Not in this build yet

- WhatsApp sending (no provider chosen yet). RSVP links use WhatsApp share links; all system email goes through Resend.
- Self-makeup classes (marked "coming soon" in the spec).
- Email sends right after each action when `RESEND_API_KEY` is set, and again by the daily job; vendors and brides can switch event emails off.
- Razorpay and PayU are implemented to their documented signatures but untested without live keys; run one test-mode payment on each before switching them on.
- Required category fields are enforced when a vendor saves; imported artists may be missing them until they edit their profile.
