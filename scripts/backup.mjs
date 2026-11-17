// Saves the whole marketplace (schema mkt and its data) to one file you can restore from.
// Usage: DATABASE_URL=<direct connection, port 5432> node scripts/backup.mjs [folder]
// Needs pg_dump 15 or newer on this computer (macOS: brew install libpq). Use Supabase's direct
// connection string, not the pooler on port 6543: pg_dump cannot run through the transaction pooler.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (/:6543\b/.test(url)) {
  console.error('This is the pooler address (port 6543). Use the direct connection (port 5432) for backups.');
  process.exit(1);
}
const dir = path.resolve(process.argv[2] ?? 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const file = path.join(dir, `olready-${stamp}.dump`);
const book = path.join(dir, `olready-${stamp}-migrations.dump`);
// Two files: everything in schema mkt, and the two small tables that record which migrations and data files are loaded.
const dump = (out, what) => spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', ...what, '--file', out, url], { stdio: 'inherit' });
for (const r of [dump(file, ['--schema=mkt']), dump(book, ['--table=public.mkt_migrations', '--table=public.mkt_data_files'])]) {
  if (r.error || r.status !== 0) {
    console.error(r.error ? 'pg_dump was not found. Install it first (macOS: brew install libpq && brew link --force libpq).' : 'Backup failed.');
    process.exit(1);
  }
}
console.log(`Saved ${file} (${(statSync(file).size / 1e6).toFixed(1)} MB) and ${path.basename(book)}`);
console.log('Restore both into an empty database, the big file first:');
console.log(`  pg_restore --no-owner --no-privileges -d "<its direct connection string>" ${file}`);
console.log(`  pg_restore --no-owner --no-privileges -d "<its direct connection string>" ${book}`);
