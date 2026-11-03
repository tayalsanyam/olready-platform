import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveVendor, profile, resetDb, testSql } from './helpers';
import { costEntries, costFaq, costGuide, costPath, costTitle } from '@/lib/costGuide';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

async function priced(cat: string, city: string, name: string, price: number | null, attributes: Record<string, unknown> = {}) {
  const o = await profile(sql, 'vendor', name);
  const v = await liveVendor(sql, o.id, cat, city, name);
  await sql`update mkt.vendors set starting_price_inr = ${price}, attributes = ${sql.json(attributes as never)} where id = ${v.id}`;
  return v;
}

describe('price guides', () => {
  it('stays out of the index until enough vendors list a price, then ranges and FAQs come from live listings', async () => {
    expect(await costGuide(sql, 'bridal-makeup', 'mohali')).toBeNull();
    await priced('bridal-makeup', 'mohali', 'Asha Looks', 15000);
    await priced('bridal-makeup', 'mohali', 'Glow Studio', 25000);
    await priced('bridal-makeup', 'mohali', 'No Price Yet', null);
    let g = await costGuide(sql, 'bridal-makeup', 'mohali');
    expect(g?.priced).toBe(2);
    expect(g?.indexable).toBe(false);
    expect((await costEntries(sql)).some((e) => e.path === '/cost/bridal-makeup/mohali')).toBe(false);

    await priced('bridal-makeup', 'mohali', 'Bridal Bay', 40000);
    await priced('bridal-makeup', 'mohali', 'Rani Makeovers', 60000);
    g = await costGuide(sql, 'bridal-makeup', 'mohali');
    expect(g?.indexable).toBe(true);
    expect(g?.min).toBe(15000);
    expect(g?.max).toBe(60000);
    expect(g!.low).toBeLessThanOrEqual(g!.mid);
    expect(g!.mid).toBeLessThanOrEqual(g!.high);
    expect(g?.cheapest[0].name).toBe('Asha Looks');
    expect(g?.quoteMid).toBeNull(); // fewer than 5 real quotes: no quote figure shown

    const entries = await costEntries(sql);
    expect(entries.map((e) => e.path)).toEqual(expect.arrayContaining(['/cost/bridal-makeup/mohali', '/cost/bridal-makeup']));
    expect(costPath('bridal-makeup', 'mohali')).toBe('/cost/bridal-makeup/mohali');
    expect(costTitle(g!)).toMatch(/cost in Mohali \(\d{4}\)$/);
    const faq = costFaq(g!);
    expect(faq[0].a).toContain('₹15,000');
    expect(faq.at(-1)?.q).toMatch(/exact prices/);
  });

  it('a town guide counts vendors who serve that town, and unknown slugs return nothing', async () => {
    const [mohali] = await sql<{ id: number }[]>`select id from mkt.cities where slug = 'mohali'`;
    const v = await priced('photographers', 'chandigarh', 'Lens Lane', 50000);
    await sql`update mkt.vendors set service_city_ids = array_append(service_city_ids, ${mohali.id}) where id = ${v.id}`;
    expect((await costGuide(sql, 'photographers', 'mohali'))?.priced).toBe(1);
    expect(await costGuide(sql, 'no-such-category', null)).toBeNull();
    expect(await costGuide(sql, 'photographers', 'atlantis')).toBeNull();
  });
});
