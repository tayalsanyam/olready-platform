# Running Olready: backups, a staging copy, moving the database, ads

## Before real brides arrive

1. **Remove the demo data.** Ops > Data shows a card while any demo vendor, person or request is on the site. Type REMOVE DEMO and press the button (admins only). Guides, categories, towns and settings stay; the test payment gateway is switched off.
2. **Set the site address.** `NEXT_PUBLIC_SITE_URL` in Vercel must be the address people actually open. Emails, sign-in codes and the sitemap use it. Put the same address in Supabase > Authentication > URL configuration (Site URL, and `<address>/auth/confirm` as a redirect URL).

## Backups

Supabase keeps its own daily backups on paid plans. For a copy you hold yourself:

```
DATABASE_URL="<Supabase direct connection, port 5432>" npm run db:backup
```

This writes two files into `backups/` (never committed). It needs `pg_dump` on the computer (`brew install libpq && brew link --force libpq`). Use the direct connection string, not the pooler on port 6543. To restore into an empty database, run the two `pg_restore` lines the command prints, big file first.

Uploaded photos live in Supabase Storage, not in the database: download the bucket from the Supabase dashboard when you take a backup you intend to keep.

## A staging copy

A second copy to try changes on before the real site gets them:

1. Create a second Supabase project in the same region as the live one.
2. In Vercel, add the staging project's values under **Preview** environment variables (`DATABASE_URL`, the Supabase URL and keys, `NEXT_PUBLIC_SITE_URL` set to the preview address). Leave the WhatsApp, Resend, Meta and payment keys empty there so staging can never message or charge a real person.
3. Run `DATABASE_URL="<staging pooler string>" npm run db:migrate`, then `npm run db:seed` for demo vendors (the seed refuses to run when `NODE_ENV=production`).
4. Every pull request on GitHub then gets its own preview address running against staging.

## Checks on every push

`.github/workflows/checks.yml` runs the type check, a vulnerability check of what ships, all tests against a fresh Postgres, and a production build on every push to `main` and every pull request. A red cross on a commit in GitHub means do not deploy it.

## Moving the database to Mumbai

The site and the database must sit in the same region; today both are in Sydney, so a visitor in India waits for one round trip to Sydney per page (about half a second). Mumbai would remove most of that. Do it in a quiet hour:

1. Create a new Supabase project in **ap-south-1 (Mumbai)**. Copy the Authentication settings (email provider, Site URL, redirect URLs) from the old one.
2. Put the site in maintenance for the copy: in Vercel, pause the deployment or point the domain at a holding page, so nothing is written mid-copy.
3. `DATABASE_URL="<old direct string>" npm run db:backup`, then run the two printed `pg_restore` lines against the new project's direct string.
4. Move sign-in accounts: Supabase does not copy accounts between projects. Sign-in is by emailed code, so each person gets a fresh account the first time they sign in on the new project, and Olready links it to their existing profile by email. For that link to happen, clear the old account ids once, in the new project's SQL editor: `update mkt.profiles set auth_user_id = null;`. Staff who use an authenticator keep it (it is stored in `mkt.profiles`).
5. Copy the Storage bucket (download from the old project, upload to the new one, same bucket name and paths).
6. In Vercel, replace `DATABASE_URL` and the Supabase URL and keys with the new project's, change `vercel.json` regions to `["bom1"]`, and redeploy.
7. Open `/api/health`: `db_ms` should be under 10. Sign in, open a vendor profile with photos, send a test request.
8. Keep the old project paused for two weeks before deleting it.

## Measuring Instagram and Facebook ads (Meta Pixel)

Set `META_PIXEL_ID` in Vercel to the pixel's number and redeploy. Visitors then see one small question, "Can we measure our ads?". Nothing from Meta loads until they press Allow; "No thanks" is remembered. Allowed visits send PageView on every page, Lead when a request is sent or a number is left, and CompleteRegistration after sign-up. "Cookie choices" in the footer reopens the question. Remove the variable to switch the pixel off entirely.

## Add to home screen

The site ships a web app manifest, so on Android (Chrome > Add to Home screen) and iPhone (Share > Add to Home Screen) it opens full screen with the Olready icon, with shortcuts to My wedding, the vendor dashboard and Get quotes. This is not a Play Store or App Store app.

## Hindi and Punjabi

A visitor picks English, हिन्दी or ਪੰਜਾਬੀ on the home page or in the footer; the choice is one cookie (`olr_lang`). `lib/i18n.ts` holds every translated line as `[English, Hindi, Punjabi]`, keyed by the English text exactly as the page shows it; `components/Translate.tsx` swaps the text after the page loads. To translate more of the site, add rows. Lines with no row stay in English: vendor names and descriptions, prices, long guides, the legal pages, emails and WhatsApp messages. Team and vendor screens are always English. The translations were written without a native reviewer: have one read `lib/i18n.ts` before running ads in either language. Google sees the English page.

## Classes

Makeup and mehendi artists with a live profile list classes under **Classes** in their dashboard (`/vendor/classes`): name, date, length, seats, fee, in person or online. Classes appear at `/classes`, on the artist's profile and in the sitemap at once. A visitor asks for a seat with a name and mobile number, no account. The artist is emailed (first name only), sees the name and number in her dashboard, calls, confirms the seat and takes the fee herself; Olready does not collect class fees. The same number lands in Ops > Leads > Numbers to call marked "Class seat". Ops > Classes hides a class that should not be on the site. To let another category teach, add its slug to `TEACHING` in `lib/classes.ts`.

## Play Store and App Store

The site is installable as it is (Add to home screen). A store listing needs accounts only you can open:

- **Android (Play Store):** a Google Play developer account (one-time fee, identity check). Go to pwabuilder.com, enter the site address, choose Android, and download the package it builds. Upload it in Play Console. Play Console then shows the app's signing certificate SHA-256 fingerprint: set `ANDROID_APP_PACKAGE` (for example `in.olready.app`) and `ANDROID_APP_SHA256` in Vercel and redeploy. `/.well-known/assetlinks.json` then confirms the app belongs to the site, and it opens full screen with no browser bar.
- **iPhone (App Store):** an Apple Developer account (yearly fee) and a Mac with Xcode. PWABuilder also produces an iOS project that wraps the site. Apple often rejects apps that are only a website, so expect to add something native (push notifications are the usual one) before it is accepted.

Neither app needs changes to this codebase beyond the two variables above.
