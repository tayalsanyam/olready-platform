# Next window: bride AI helper, then full testing

Order of work: **1. validation pass on what exists** (so we build on solid ground), **2. bride AI helper**, **3. full test matrix including every vendor category**, **4. real-vendor pilot**. Mobile apps come after the web is complete.

---

## 1. Bride AI planning helper

### What it is
A chat helper for brides and their family inside OLReady, at `/me/assistant`, with an "Ask OLReady" entry on My wedding, listing pages and vendor profiles. It answers from OLReady's own data and the bride's own wedding, and can do things for her with her confirmation.

### What it can do (Claude tool use; each tool is a server function over our data)
| Tool | Reads or writes | Notes |
| --- | --- | --- |
| `search_vendors` | reads | category, city/locality, budget, date, guest count, category filters, rating. Only live vendors; returns slugs and links. |
| `vendor_details` | reads | public profile fields, halls, price bands, review summary, quote-reader style "what is usually included". Never phone, email or Instagram. |
| `my_wedding` | reads | date, city, functions, budget summary, checklist progress, shortlist, open requests, quotes with readings. Only the signed-in bride's wedding (or one she is a family member of). |
| `compare_quotes` | reads | per category, with Included / Extra / Worth asking. |
| `price_guide` | reads | typical Tricity ranges per category from our vendors' starting prices and accepted quotes (aggregates only, min sample size). |
| `find_ideas` / `find_articles` | reads | gallery photos by topic and style; blog articles for advice. |
| `add_to_shortlist`, `add_checklist_item`, `set_category_budget` | writes | shown as a card with **Confirm**; nothing changes until she taps it. |
| `draft_request` | writes a draft | fills the enquiry form; she reviews and sends it herself. The helper never sends a request or messages a vendor. |

### Rules
- Never invents a vendor, a price or a review: every vendor named comes from a tool result and links to its page. Checked automatically (see evaluation).
- No vendor contact details, ever. Same rule as the rest of the site.
- Answers in English, Hindi or Hinglish, matching the bride.
- Sponsored vendors: **decision needed** (see below). Default proposal: rank by fit only; Boosts never influence AI answers.
- Advice about money, health or legal matters stays general and points to people.

### Data and privacy
- Tables: `mkt.assistant_threads`, `mkt.assistant_messages` (role, text, tool calls and results), `mkt.assistant_feedback` (thumbs plus a note).
- Only the bride's own wedding data goes to the model, only in her session. Transcripts kept 90 days, then deleted by the daily job.
- Settings: per-bride daily messages (default 40), site daily cap, kill switch. Models from env: `ANTHROPIC_BRIDE_MODEL` (Sonnet) for chat, Haiku for titles and classification.

### Ops side
- `/ops/assistant-review`: sampled and thumbs-down conversations, with flags for "named a vendor not in tool results", "contact detail in answer", "no tool used for a factual answer".
- Cost and usage by day; kill switch.

### Build steps
1. Schema, settings, model wrapper with tool loop and streaming (route handler, server-sent events).
2. Read tools plus `/me/assistant` UI (mobile first, suggested starters from her wedding state: "Find venues for 400 guests in Zirakpur under ₹1,500 a plate").
3. Write tools with confirm cards; draft request handoff to `/enquire`.
4. Entry points on My wedding, listings and profiles (context passed in: "about these results", "about this vendor").
5. Ops review page, retention job, limits.
6. Evaluation set and checks (below), then tune prompts.

### Evaluation (must pass before launch)
- 50 scripted bride questions across categories, cities, budgets, Hinglish, and traps ("give me her number", "is X better than Y" with no data, a vendor that does not exist).
- Automatic checks on every answer: every `/v/<slug>` exists and is live; no phone/email patterns; every vendor named appears in that turn's tool results; write tools never run without a confirm.
- Run against the seeded demo data and against a copy with real vendors.

### Decisions needed from Sanyam
1. Name ("Ask OLReady" as a placeholder).
2. Logged-out visitors: none, or a small limit (e.g. 5 questions) before sign-in.
3. Sponsored vendors in AI answers: excluded from ranking (proposal) or shown in a labelled separate line.
4. Family members: same helper with the same data access they already have (proposal: yes).

---

## 2. Testing plan

### A. Validation pass (start of the window)
- `next build` on production settings; fix anything that only breaks there.
- Update `tests/e2e/walkthrough.mjs` for screens added since it was written: invite editor, budget, compare, promote, photo search, ideas, blog, sign-in codes, Data, Ask the data, WhatsApp, invoices. Run at 390 and 1280 wide: no horizontal overflow, no console errors, no 500s.
- Screenshot set for review.

### B. Roles and access matrix
For each role (visitor, bride, family member, vendor, vendor on a plan, ops, content, rm, admin), every route group is checked for the right page or the right refusal. Includes: vendor contact never in any HTML or JSON a bride or visitor receives (scan responses for phone/email patterns); downloads admin-only with sign-in code; invoices only for buyer, vendor owner and Ops.

### C. Every vendor category, end to end
Categories: venues, caterers, planners, bridal wear, jewellery, bridal makeup, photographers, decorators, mehendi, DJs and dhol.

For **each** category, one scripted run (automated where possible, with a manual sign-off column):

| # | Flow | What is checked |
| --- | --- | --- |
| 1 | Onboard | category fields render and save (venue halls and capacity, caterer per-plate veg/non-veg, etc.); photos upload; Ops review and go live |
| 2 | Public profile | facts, halls, price bands, histogram, similar vendors, JSON-LD valid |
| 3 | Listings and SEO | `/vendors/<city>/<category>` and every filter page; price-band and rating chips; locality cities; thin-page guard; sitemap entry |
| 4 | Card | the right three facts with labels; Sponsored label when boosted |
| 5 | Enquiry | multi-category request including this category; WhatsApp box unticked by default; "also let others quote" |
| 6 | Verification | three-stage call script asks this category's questions |
| 7 | Unlock | credit cost and tier for this category; cap reached; reopen round; fake-lead refund |
| 8 | Conversation | message, file attachment, moderation flags (phone, card number), report |
| 9 | Quote | send; quote reader lists; compare page; accept; decline |
| 10 | Booking and review | either side reports; reward to reporter only; review with amount, date, photos; vendor reply; dispute with deadlines |
| 11 | Vendor tools | insights numbers match visits; review request link; website widget; callback request |
| 12 | Money | plan purchase with invoice; top-up; ads wallet top-up; Boost charging once per visitor per day within budget; banner booking; coupon; refund with credit note |
| 13 | Notifications | emails, WhatsApp only with opt-in or alerts, STOP |
| 14 | Search | site search, photo search for categories with styles, collections, ideas gallery tags |

Output: a pass/fail grid of 10 categories × 14 flows, kept in the repo (`docs/test-matrix.md`) with links to failures.

### D. Bride tools
Workspace, checklist, functions, guests and RSVP, e-invites (all 44 designs render; video export MP4/WebM; PNG), family join code, budget visibility, wall, shortlist "ask all", RM purchase and assignment.

### E. Payments, live
Razorpay and PayU in test mode, then a ₹1 live payment and refund on each; manual bank transfer; invoice numbers continue without gaps; credit notes.

### F. Load and speed
Seed 5,000 vendors, 50,000 leads, 200,000 messages. Listing, profile and Ops data pages under 500 ms server time; Lighthouse mobile on home, listing and profile (target 85+ performance).

### G. Legacy import rehearsal
Real artists CSV and plans CSV from Laravel through the dry runs, then into a staging copy; spot-check 20 artists and every running plan.

### H. Real-vendor pilot (after A–G)
- Two to three vendors per category: existing OLReady artists for beauty, new sign-ups for the others. Ten to fifteen real brides through the full flow with Ops verifying.
- Script per vendor, a short feedback form, and a 30-minute call at the end of week 1.
- Success: every vendor unlocks and quotes at least once; no contact-detail leaks; brides rate the request-to-quote flow 4/5 or better; zero payment or invoice errors.

### Exit criteria for launch
All of A–G green; pilot success criteria met; production keys set (Supabase, Vercel, cron secret, Razorpay/PayU live, Resend, Anthropic, WhatsApp templates approved); SELLER_GSTIN and SAC codes confirmed by the accountant.
