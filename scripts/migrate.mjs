// Applies supabase/migrations/*.sql in order, then the reference seed.
// Usage: node scripts/migrate.mjs [--reset]
// --reset drops the mkt schema first (local development only).
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from './csv.mjs';

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

// Tricity towns whose areas are curated by hand in the reference data.
const CURATED = ['chandigarh', 'mohali', 'panchkula', 'zirakpur', 'kharar', 'new-chandigarh', 'dera-bassi'];

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
  await loadPlaces();
} finally {
  await sql.end();
}


/**
 * Towns (data/towns.csv: one per district in India), India Post pincodes (data/pincodes.csv.gz) and
 * areas from each pincode's main post office. Reloads only when a file changes; Ops' own choices
 * (town names, launches, manual pincode towns, areas they added or switched off) are kept.
 */
async function loadPlaces() {
  await sql`create table if not exists public.mkt_data_files (name text primary key, hash text not null, loaded_at timestamptz not null default now())`;
  const changed = async (name, raw) => {
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const [done] = await sql`select hash from public.mkt_data_files where name = ${name}`;
    return done?.hash === hash ? null : hash;
  };
  const mark = (name, hash) => sql`insert into public.mkt_data_files (name, hash) values (${name}, ${hash}) on conflict (name) do update set hash = excluded.hash, loaded_at = now()`;

  const townsRaw = await readFile(path.join(root, 'data', 'towns.csv'));
  const [{ towns }] = await sql`select count(*)::int as towns from mkt.cities`;
  let th = await changed('towns', townsRaw);
  if (th || towns < 50) {
    const list = parseCsv(townsRaw.toString('utf8')).map((r, i) => ({
      slug: r.slug, name: r.name, state_code: r.state_code, sort: 1000 + i,
      districts: r.districts ? r.districts.split('|') : [], aliases: r.aliases ? r.aliases.split('|') : [],
    }));
    await sql.begin(async (tx) => {
      for (const t of list) {
        await tx`
          insert into mkt.cities (slug, name, state_code, districts, aliases, sort, district)
          values (${t.slug}, ${t.name}, ${t.state_code}, ${t.districts}, ${t.aliases}, ${t.sort}, ${t.districts[0] ?? ''})
          on conflict (slug) do update set districts = excluded.districts,
            aliases = array(select distinct unnest(mkt.cities.aliases || excluded.aliases))`;
      }
      await mark('towns', th ?? 'initial');
    });
    console.log(`Towns loaded: ${list.length}`);
  }

  const raw = await readFile(path.join(root, 'data', 'pincodes.csv.gz'));
  const ph = await changed(`pincodes${process.env.MKT_PLACE_STATES ? `:${process.env.MKT_PLACE_STATES}` : ''}`, raw);
  const [{ n }] = await sql`select count(*)::int as n from mkt.pincodes`;
  if (ph || n === 0) {
    // MKT_PLACE_STATES=04,03,06 loads only those states' pincodes (tests use it to keep resets fast).
    const only = (process.env.MKT_PLACE_STATES ?? '').split(',').filter(Boolean);
    const rows = parseCsv(gunzipSync(raw).toString('utf8')).filter((r) => !only.length || only.includes(r.state_code));
    await sql.begin(async (tx) => {
      for (let i = 0; i < rows.length; i += 2000) {
        const batch = rows.slice(i, i + 2000).map((r) => ({
          pincode: r.pincode, state_code: r.state_code, district: r.district, offices: r.offices ? r.offices.split('|') : [],
        }));
        await tx`
          insert into mkt.pincodes ${tx(batch, 'pincode', 'state_code', 'district', 'offices')}
          on conflict (pincode) do update set state_code = excluded.state_code, district = excluded.district, offices = excluded.offices
            where not mkt.pincodes.manual`;
      }
      await mark(`pincodes${process.env.MKT_PLACE_STATES ? `:${process.env.MKT_PLACE_STATES}` : ''}`, ph ?? 'initial');
    });
    console.log(`Pincodes loaded: ${rows.length}`);
  }
  const [{ map_pincodes: mapped }] = await sql`select mkt.map_pincodes()`;
  if (mapped) console.log(`Pincodes mapped to towns: ${mapped}`);

  // Areas outside the curated Tricity: each pincode's main post office ("Koramangala", "Andheri East").
  const [{ po }] = await sql`select count(*)::int as po from mkt.localities where source = 'post_office'`;
  if (ph || mapped || po === 0) {
    const added = await sql`
      insert into mkt.localities (city_id, slug, name, kind, pincode, sort, source)
      select distinct on (p.city_id, s.slug) p.city_id, s.slug, n.name, 'area', p.pincode, 500, 'post_office'
      from mkt.pincodes p join mkt.cities c on c.id = p.city_id,
        lateral (select trim(regexp_replace(regexp_replace(regexp_replace(p.offices[1],
          '\\s*\\((East|West|North|South|Central)\\)\\s*$', ' \\1', 'i'), '\\s*\\([^)]*\\)\\s*$', ''), '\\s+', ' ', 'g')) as name) n,
        lateral (select trim(both '-' from regexp_replace(lower(n.name), '[^a-z0-9]+', '-', 'g')) as slug) s
      where c.slug <> all(${CURATED}) and cardinality(p.offices) > 0 and length(n.name) between 2 and 80 and s.slug <> ''
        and lower(n.name) not in (lower(c.name), 'g.p.o', 'gpo')
      order by p.city_id, s.slug, p.pincode
      on conflict (city_id, slug) do nothing
      returning id`;
    if (added.length) console.log(`Areas added from post offices: ${added.length}`);
  }
}
