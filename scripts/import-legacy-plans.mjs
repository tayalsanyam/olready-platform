// Carries plans that are still running on the Laravel merchant site, with their unused credits.
// Run scripts/import-legacy.mjs (artists) first: plans attach to vendors by legacy artist id.
// Usage: DATABASE_URL=... node scripts/import-legacy-plans.mjs plans.csv [--apply]
//
// CSV header (extra columns are ignored):
//   ref,legacy_artist_id,plan,starts_at,ends_at,credits_remaining,invoice_url,contract_url
// - ref: the old site's subscription or invoice number. Re-running with the same ref corrects that plan instead of adding one.
// - plan: pro, phoenix or privy. Dates as YYYY-MM-DD. Plans that already ended are skipped.
// - credits_remaining: enquiries the artist has left. They expire with the plan, like any plan credit.
// Without --apply it prints what would happen and writes nothing.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { parseCsv } from './csv.mjs';
import { importLegacyPlans } from '../lib/legacyPlans.ts';

const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/import-legacy-plans.mjs plans.csv [--apply]');
  process.exit(1);
}
const rows = parseCsv(await readFile(file, 'utf8'));
const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
try {
  let res;
  await sql
    .begin(async (tx) => {
      res = await importLegacyPlans(tx, rows);
      if (!apply) throw new Error('DRY_RUN');
    })
    .catch((e) => {
      if (e.message !== 'DRY_RUN') throw e;
    });
  console.table(res);
  console.log(apply ? 'Applied.' : 'Dry run: nothing was written. Add --apply to save.');
} finally {
  await sql.end();
}
