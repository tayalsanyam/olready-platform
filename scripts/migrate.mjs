// Applies supabase/migrations/*.sql in order, then the reference seed.
// Usage: node scripts/migrate.mjs [--reset]
// --reset drops the mkt schema first (local development only).
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
if (reset && process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset in production');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

try {
  if (reset) {
    await sql.unsafe('drop schema if exists mkt cascade; drop table if exists public.mkt_migrations;');
    console.log('Dropped schema mkt');
  }
  await sql.unsafe(
    'create table if not exists public.mkt_migrations (name text primary key, applied_at timestamptz not null default now())'
  );
  const dir = path.join(root, 'supabase', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await sql`select name from public.mkt_migrations`).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.mkt_migrations (name) values (${f})`;
    });
    console.log('Applied', f);
  }
  await sql.unsafe(await readFile(path.join(root, 'supabase', 'seed', 'reference.sql'), 'utf8'));
  console.log('Reference data loaded');
} finally {
  await sql.end();
}
