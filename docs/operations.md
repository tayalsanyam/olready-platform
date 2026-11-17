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
