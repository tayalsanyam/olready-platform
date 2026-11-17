import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { liveVendor, profile, resetDb, TEST_DB, testSql } from './helpers';
import { demoCounts, removeDemoData } from '@/lib/demoData';

const sql = testSql();
afterAll(() => sql.end());

describe('removing the demo data', () => {
  it('takes every demo vendor, bride and team account and leaves real ones whole', async () => {
    resetDb();
    execFileSync('node', ['scripts/seed.mjs'], { env: { ...process.env, DATABASE_URL: TEST_DB, NODE_ENV: 'test' }, stdio: 'pipe' });
    const owner = await profile(sql, 'vendor', 'Real Owner');
    const real = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Real Studio');
    const bride = await profile(sql, 'bride', 'Real Bride');
    const [demo] = await sql<{ id: string }[]>`select id from mkt.vendors where slug = 'glow-by-kirti-demo'`;
    // A real bride who saved a demo vendor and named it on her request keeps her request.
    const [lead] = await sql<{ id: string }[]>`insert into mkt.leads (bride_profile_id, bride_name, phone, city_id, source)
      select ${bride.id}, 'Real Bride', '+919811122233', id, 'website' from mkt.cities where slug = 'chandigarh' returning id`;
    await sql`insert into mkt.lead_needs (lead_id, category_id, unlock_cap, direct_vendor_id)
      select ${lead.id}, id, 5, ${demo.id} from mkt.categories where slug = 'bridal-makeup'`;

    const before = await demoCounts(sql);
    expect(before.vendors).toBe(29);
    expect(before.people).toBeGreaterThan(30);
    const gone = await removeDemoData(sql, null);
    expect(gone).toEqual(before);
    expect(await demoCounts(sql)).toEqual({ vendors: 0, people: 0, leads: 0, weddings: 0, touched: 0 });

    const [left] = await sql<{ vendors: number; needs: number; direct: string | null; cats: number; guides: number; test: boolean }[]>`
      select (select count(*) from mkt.vendors)::int as vendors, (select count(*) from mkt.lead_needs where lead_id = ${lead.id})::int as needs,
        (select direct_vendor_id::text from mkt.lead_needs where lead_id = ${lead.id}) as direct,
        (select count(*) from mkt.categories)::int as cats, (select count(*) from mkt.articles)::int as guides,
        (select enabled from mkt.gateway_settings where gateway = 'test') as test`;
    expect(left).toMatchObject({ vendors: 1, needs: 1, direct: null, test: false });
    expect(left.cats).toBeGreaterThan(10);
    expect(left.guides).toBeGreaterThan(0);
    expect((await sql`select 1 from mkt.vendors where id = ${real.id}`).length).toBe(1);
    // Running it twice is harmless.
    expect((await removeDemoData(sql, null)).vendors).toBe(0);
  }, 120_000);
});
