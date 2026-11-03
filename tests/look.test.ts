import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { lookVendors, readLook, takeLookAllowance } from '@/lib/look';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

describe('search by photo', () => {
  it('ranks vendors by declared styles and tagged work, in the chosen city', async () => {
    const cat = await categoryId(sql, 'mehendi-artists');
    const mk = async (name: string, city: string, known: string[], photoTags: string[][]) => {
      const o = await profile(sql, 'vendor', name);
      const v = await liveVendor(sql, o.id, 'mehendi-artists', city, name);
      await sql`update mkt.vendors set known_for = ${known} where id = ${v.id}`;
      for (const t of photoTags) await sql`insert into mkt.vendor_media (vendor_id, url, tags) values (${v.id}, '/demo/demo-1.jpg', ${t})`;
      return v;
    };
    const a = await mk('Arabic Queen', 'chandigarh', ['arabic'], [['arabic'], ['arabic', 'minimal']]);
    const b = await mk('Minimal Mehendi', 'chandigarh', [], [['minimal']]);
    await mk('Traditional Only', 'chandigarh', ['traditional'], []);
    await mk('Far Arabic', 'ludhiana', ['arabic'], [['arabic']]);
    const r = await lookVendors(sql, { categoryId: cat, cityId: await cityId(sql, 'chandigarh'), tags: ['arabic', 'minimal'] });
    expect(r.map((v) => v.id)).toEqual([a.id, b.id]);
    expect(r[0].score).toBe(2 + 2);
    expect(r[0].matched.sort()).toEqual(['arabic', 'minimal']);
  });

  it('keeps only styles from the list, and caps use per visitor', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'Sure: {"tags":["arabic","made-up","minimal","arabic"]}' }] }), { status: 200 })
    );
    const tags = await readLook(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg', 'Mehendi designs', [
      { slug: 'arabic', label: 'Arabic' },
      { slug: 'minimal', label: 'Minimal' },
    ]);
    expect(tags).toEqual(['arabic', 'minimal']);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body));
    expect(JSON.stringify(body)).not.toMatch(/@|\+91/); // nothing about the person goes to the model
    fetchMock.mockRestore();
    delete process.env.ANTHROPIC_API_KEY;

    await sql`update mkt.settings set value = '2' where key = 'look_per_visitor_day'`;
    await takeLookAllowance(sql, 'v1');
    await takeLookAllowance(sql, 'v1');
    await expect(takeLookAllowance(sql, 'v1')).rejects.toThrow(/2 times a day/);
    await takeLookAllowance(sql, 'v2');
  });
});
