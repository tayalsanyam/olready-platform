// Imports makeup artists exported from the old Laravel site, without touching the legacy tables.
// Usage: DATABASE_URL=... node scripts/import-legacy.mjs artists.csv [--dry-run]
//
// Expected CSV header (export it from Laravel; extra columns are ignored):
//   id,name,email,phone,city,instagram,starting_price,on_plan
// - id is stored as vendors.legacy_artist_id, so re-running the import updates instead of duplicating.
// - email creates or links the artist's login profile; on first sign-in with that email the account attaches.
// - on_plan = 1 marks the artist Assured. Imported artists stay visible but are NOT marked verified
//   until Ops verifies them.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry-run');
if (!file) {
  console.error('Usage: node scripts/import-legacy.mjs artists.csv [--dry-run]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
try {
  const rows = parseCsv(await readFile(file, 'utf8'));
  const [{ id: makeup }] = await sql`select id from mkt.categories where slug = 'bridal-makeup'`;
  const cities = await sql`select id, slug, name from mkt.cities`;
  const findCity = (name) => cities.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.slug === slugify(name));
  let created = 0, updated = 0, skipped = 0;
  await sql.begin(async (tx) => {
    for (const r of rows) {
      const legacyId = Number(r.id);
      const city = findCity(r.city || '');
      if (!legacyId || !r.name || !city) {
        skipped++;
        console.warn('Skipped row', r.id, r.name, '(missing id, name or unknown city:', r.city, ')');
        continue;
      }
      const email = r.email ? r.email.toLowerCase() : null;
      let owner = null;
      if (email) {
        const [p] = await tx`
          insert into mkt.profiles (email, full_name, phone, role) values (${email}, ${r.name}, ${r.phone || null}, 'vendor')
          on conflict (email) do update set role = case when mkt.profiles.role = 'bride' then 'vendor' else mkt.profiles.role end
          returning id`;
        owner = p.id;
      }
      const price = Number(String(r.starting_price || '').replace(/[^\d]/g, '')) || null;
      const [existing] = await tx`select id from mkt.vendors where legacy_artist_id = ${legacyId}`;
      if (existing) {
        await tx`
          update mkt.vendors set business_name = ${r.name}, phone = coalesce(${r.phone || null}, phone),
            instagram = coalesce(${r.instagram || null}, instagram), starting_price_inr = coalesce(${price}, starting_price_inr),
            assured = ${r.on_plan === '1'}, owner_profile_id = coalesce(owner_profile_id, ${owner}), updated_at = now()
          where id = ${existing.id}`;
        updated++;
      } else {
        let slug = `${slugify(r.name)}-${city.slug}`;
        const [taken] = await tx`select 1 from mkt.vendors where slug = ${slug}`;
        if (taken) slug = `${slug}-${legacyId}`;
        await tx`
          insert into mkt.vendors (owner_profile_id, legacy_artist_id, category_id, city_id, service_city_ids, slug, business_name,
            starting_price_inr, phone, email, instagram, status, claim_status, assured, attributes)
          values (${owner}, ${legacyId}, ${makeup}, ${city.id}, ${[city.id]}, ${slug}, ${r.name}, ${price}, ${r.phone || null},
            ${email}, ${r.instagram || null}, 'live', 'claimed', ${r.on_plan === '1'}, '{}'::jsonb)`;
        created++;
      }
    }
    if (dry) throw new Error('DRY_RUN');
  }).catch((e) => {
    if (e.message !== 'DRY_RUN') throw e;
    console.log('Dry run: nothing was written');
  });
  console.log({ rows: rows.length, created, updated, skipped });
} finally {
  await sql.end();
}
