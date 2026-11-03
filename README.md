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
- Plans (Pro, Phoenix, Privy) activate once Ops adds the signed-contract link; OLReady issues the GST tax invoice itself on payment. Top-ups activate on payment. Pack changes apply to new purchases only.
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
npm test                          # 98 integration tests against the database
node tests/e2e/walkthrough.mjs    # 41-step UI walkthrough in headless Chrome at phone width (fresh demo data)
node tests/e2e/sweep.mjs          # every sitemap page, contact-leak scan, 7-role access matrix (fresh demo data)
```

`DEV_AUTH` and the test payment gateway are refused when `NODE_ENV=production`.

## Deploy

1. **Database.** On the existing "Olready Website" Supabase project, run `DATABASE_URL=<pooler URI> npm run db:migrate`. It applies the migrations in `supabase/migrations` and loads reference data. It never drops anything without `--reset`, and `--reset` refuses to run in production.
2. **Auth.** Supabase > Authentication > Email: enable email OTP and put `{{ .Token }}` in the sign-in template. Add `/auth/confirm` as a redirect URL if you also want magic links.
3. **Vercel.** Import the repo, set the variables from `.env.example`, and keep the region `bom1`. `vercel.json` schedules `/api/cron/daily` (07:00 IST) for dispute expiry, feedback emails, plan expiry (unused plan credits are written off), RM engagements ending, and the email outbox; set `CRON_SECRET`. `proxy.ts` keeps Supabase sign-ins fresh.
4. **Photos.** Set `SUPABASE_SERVICE_ROLE_KEY` (server only). Migration 4 creates the public `olready-media` bucket.
5. **Payments.** Add Razorpay and PayU keys, point the Razorpay webhook at `/api/payments/razorpay/webhook` (events `payment.captured`, `order.paid`), then switch the gateways on in Ops > Payments.
6. **Staff.** Staff come from the sales-site admin. Set `SALES_DATABASE_URL` (on the shared Supabase project it is the same as `DATABASE_URL`) and press *Sync staff now* in Ops > Staff, or run `node scripts/link-sales-staff.mjs` (dry run; add `--apply`). Sales admins become admins, editors become content staff, commercial and sales staff get Ops; anyone deactivated there loses access here. Roles set by hand in Ops > Staff (RMs, for example) are never overwritten. Each person signs in with their email and the account links itself.
7. **Legacy artists.** Export artists from Laravel as CSV and run `node scripts/import-legacy.mjs artists.csv --dry-run`, then without `--dry-run`. Re-running updates instead of duplicating.
8. **Legacy plans.** After the artists, export plans still running on Laravel as `ref,legacy_artist_id,plan,starts_at,ends_at,credits_remaining,invoice_url,contract_url` and run `node scripts/import-legacy-plans.mjs plans.csv` (dry run), then with `--apply`. Each plan starts active with its unused enquiries as plan credits, which expire with the plan. Re-running with the same `ref` corrects the balance instead of adding to it. Ended plans are skipped. Leads already bought on Laravel stay there: those brides never agreed to the new verification and messaging, so they are not copied.
9. **One price list.** Pro, Phoenix and Privy prices are edited only in Ops > Payments > Packs and published at `/api/public/packs`. On the sales site, merge the `platform-prices` branch and set `PLATFORM_URL` and `NEXT_PUBLIC_PLATFORM_URL` to this site's origin: its 5-minute jobs cron pulls the prices, the admin price field turns read-only, and its admin links to Ops. Point the sales site's artist sign-up link (Settings > merchant URL) at `/vendor/onboard` here when you are ready to move artists off Laravel.

## Not in this build yet

- WhatsApp sending (no provider chosen yet). RSVP links use WhatsApp share links; all system email goes through Resend.
- Self-makeup classes (marked "coming soon" in the spec).
- Email sends right after each action when `RESEND_API_KEY` is set, and again by the daily job; vendors and brides can switch event emails off.
- Razorpay and PayU are implemented to their documented signatures but untested without live keys; run one test-mode payment on each before switching them on.
- Required category fields are enforced when a vendor saves; imported artists may be missing them until they edit their profile.

## Ops data, AI and billing (November 2026)

- **Data** (`/ops/data`): 15 lists (vendors, leads, needs, unlocks, orders, refunds, plans, credit and ads-wallet ledgers, tax documents, reviews, conversations, callbacks, emails, audit) with search, filters, sorting and paging. Admins download any list as filtered; downloads need a passed sign-in code and are audited.
- **Ask the data** (`/ops/assistant`): Claude (`ANTHROPIC_OPS_MODEL`) writes one SELECT over the `ops_reports` views, which hold no phone numbers, emails or brides' names. Queries are checked, then run read-only as the `ops_assistant` role (8 s, 500 rows). Daily limits are in Settings.
- **Quote reader**: each quote is read once (`ANTHROPIC_QUOTE_MODEL`) into Included / Charged extra / Worth asking, shown on Compare quotes and in conversations.
- **Tax invoices**: issued when an order is paid, with a credit note per refund. Numbering is gap-free per financial year, the split is CGST+SGST/UTGST or IGST by place of supply, and every document is a PDF at `/invoices/[id]`. Configure with `SELLER_*`, `INVOICE_PREFIX` and `INVOICE_SAC*`; have your accountant confirm the SAC codes.
- **WhatsApp** (`/ops/whatsapp`): Meta Cloud API or Wati, set through `WHATSAPP_*` and `WATI_API_URL`. Nothing is sent until an approved template is mapped and switched on. Brides only receive messages for requests where they ticked the box, and vendors only if they turned alerts on. STOP replies go to the webhook at `/api/whatsapp`.
- **Ask OLReady** (`/me/assistant`): the brides' planning helper, built on Claude with tools over OLReady's own data (`ANTHROPIC_BRIDE_MODEL`). It covers vendor search (by guests, price, style and rating), vendor details, the bride's own plan, her quotes, a Tricity price guide, ideas and guides. It changes the shortlist, checklist and category budgets only through Confirm cards, and prepares quote requests that she sends herself. Every answer is checked before it is shown: vendor links not found by a lookup in that chat are removed, phone numbers and emails are stripped, and prices given without a lookup are flagged. Ops review flagged and unhelpful answers at `/ops/bride-ai`. Limits, the on/off switch and how long chats are kept (90 days) are in Settings. Run the live 50-question evaluation with `RUN_EVAL=1 ANTHROPIC_API_KEY=… EVAL_DATABASE_URL=… npm run eval:assistant`.

## Sign-up, vendor landing and admin (November 2026)

- **Signing up is signing in.** `/login` has two doors, "Planning a wedding" and "Wedding business". There is no password: a new email gets a code and creates the account, with the name typed on the first step. Brides land in My wedding, where any request sent earlier with the same email is waiting. Vendors land in their dashboard, or in onboarding if they have no business yet. Staff land in Ops. Sending a request at `/enquire` needs no account at all.
- **For vendors** (`/for-vendors`): the landing page for businesses. It covers what a verified lead looks like, how it works, the categories, live prices from the price list, FAQs and sign-in. The header, footer and home page link here.
- **Admin:** the Ops home shows admins this month's billing after refunds, GST to pay, new plans and unspent ads-wallet balances, all from tax documents. Its queues now include banners to approve, failed WhatsApp messages and Ask OLReady answers to check. Categories → *Cities and towns* adds, renames, reorders or switches off towns (the state sets the invoice place of supply).

## Big days, policies and search (November 2026)

- **Big days.** A request lists up to 8 functions (Roka, Mehendi, Sangeet, Wedding, Reception and so on), each with its own date and guest count, and says which functions each category is for. Nothing ticked means all of them. Vendors see only the functions they are needed for, on the lead card and in the conversation, and can price each one; the quote total is the sum. Ops can add, correct or remove functions on the verification call, and the request's headline date and guests follow. Functions also fill the bride's wedding plan without overwriting dates she set. A request drops off vendors' lists once its last function has passed.
- **Policies.** `/terms`, `/privacy`, `/refunds`, `/contact` and `/about`, adapted from the sales-site v3.1 texts and versioned in `lib/legal.ts` (`LEGAL_VERSION`, `LEGAL_EFFECTIVE`). Buying, topping up, the RM service and vendor onboarding need the terms box ticked, and the version accepted is stored on the order, lead or profile. Contact messages arrive in the Ops home queue. Have counsel review the texts before launch.
- **Price guides** (`/cost/<category>` and `/cost/<category>/<town>`): what vendors cost, from live starting prices and, once there are 5 or more, the middle of real quotes from the last year. Each guide shows the range, a breakdown by type, the lowest-priced and best-reviewed vendors, and FAQs. A guide stays `noindex` until `min_vendors_to_index` vendors list a price.
- **Directory** (`/directory`): every town, category, filter page, price guide, idea topic and guide in one place, linked from the footer.
- **Search engines.** The sitemap lists landing and filter pages, vendors with their photos, price guides, idea photos, guides and collections. `llms.txt` lists the same for answer engines. Vendor pages carry LocalBusiness JSON-LD with the areas served, images and reviews. Price guides carry FAQPage and BreadcrumbList. Each key page has its own 1200×630 share image (`lib/og.tsx`). Filter pages are titled the way people search ("Airbrush makeup artists in Mohali"). `robots.txt` hides private areas and is covered by a test.
