import { execFileSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/olready_test';
process.env.DATABASE_URL = TEST_DB;

export function resetDb() {
  execFileSync('node', [path.resolve(__dirname, '../scripts/migrate.mjs'), '--reset'], {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: 'pipe',
  });
}

export function testSql() {
  return postgres(TEST_DB, { prepare: false, onnotice: () => {}, transform: { undefined: null } });
}

type Sql = ReturnType<typeof testSql>;

export async function profile(sql: Sql, role: string, name = role) {
  const [p] = await sql<{ id: string; full_name: string; email: string; phone: string | null; role: string }[]>`
    insert into mkt.profiles (email, full_name, role)
    values (${`${name.replace(/\s/g, '').toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@test.in`}, ${name}, ${role})
    returning *`;
  return p;
}

export async function categoryId(sql: Sql, slug: string) {
  const [c] = await sql<{ id: number }[]>`select id from mkt.categories where slug = ${slug}`;
  return c.id;
}

export async function cityId(sql: Sql, slug: string) {
  const [c] = await sql<{ id: number }[]>`select id from mkt.cities where slug = ${slug}`;
  return c.id;
}

export async function liveVendor(sql: Sql, ownerId: string, catSlug: string, citySlug = 'chandigarh', name = 'Test Vendor') {
  const cat = await categoryId(sql, catSlug);
  const city = await cityId(sql, citySlug);
  const [v] = await sql<{ id: string; slug: string }[]>`
    insert into mkt.vendors (owner_profile_id, category_id, city_id, service_city_ids, slug, business_name, status, claim_status)
    values (${ownerId}, ${cat}, ${city}, ${[city]}, ${`${name.toLowerCase().replace(/\s/g, '-')}-${Math.random().toString(36).slice(2, 7)}`},
      ${name}, 'live', 'claimed')
    returning id, slug`;
  return v;
}

export async function topup(sql: Sql, vendorId: string, credits: number) {
  await sql`
    insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason) values (${vendorId}, 'topup', ${credits}, 'adjustment')`;
}
