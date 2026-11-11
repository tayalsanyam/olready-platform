import './load-env';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldsFor, listCategories, listCities } from '@/lib/catalog';
import { browseVendors, countVendors, filtersFor, getVendorBySlug, recentDemand, similarVendors } from '@/lib/vendors';
import { visibleNeeds as needsForVendor } from '@/lib/leads';
import { reviewsForVendor } from '@/lib/reviews';
import { searchVendors } from '@/lib/search';
import { threadMessages, threadsForVendor, threadsForBride } from '@/lib/threads';
import { vendorInsights } from '@/lib/analytics';
import { dataset, runDataset } from '@/lib/opsData';
import { ideaPhotos } from '@/lib/ideas';
import { runTool } from '@/lib/brideAssistant';

// Query timings on a production-sized database (scripts/load-seed.sql). Runs only when asked:
//   RUN_LOAD=1 npx vitest run tests/eval/load.eval.test.ts
// Writes docs/load-test.md. Target: every page's main query under 300 ms.

const run = Boolean(process.env.RUN_LOAD);
describe.skipIf(!run)('load', () => {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {}, transform: { undefined: null } });
  afterAll(() => db.end());

  it('times the queries behind each busy page', async () => {
    const cats = await listCategories(db, { activeOnly: true });
    const cities = await listCities(db);
    const cat = cats.find((c) => c.slug === 'venues')!;
    const city = cities.find((c) => c.slug === 'mohali')!;
    const fields = await fieldsFor(db, cat.id);
    const filter = filtersFor(fields, cat.price_bands ?? []).find((f) => f.field.key === 'capacity_max') ?? null;
    const [busy] = await db<{ id: string; slug: string; city_id: number; category_id: number; owner: string }[]>`
      select v.id, v.slug, v.city_id, v.category_id, v.owner_profile_id as owner from mkt.vendors v
      order by (select count(*) from mkt.unlocks u where u.vendor_id = v.id) desc limit 1`;
    const [thread] = await db<{ id: string }[]>`select thread_id as id from mkt.messages group by thread_id order by count(*) desc limit 1`;
    const [bride] = await db<{ id: string }[]>`select bride_profile_id as id from mkt.leads group by 1 order by count(*) desc limit 1`;
    const rows: { page: string; query: string; ms: number; rows: number }[] = [];
    const time = async (page: string, query: string, fn: () => Promise<unknown>) => {
      const t: number[] = [];
      let n = 0;
      for (let i = 0; i < 6; i++) {
        const s = performance.now();
        const r = await fn();
        t.push(performance.now() - s);
        n = Array.isArray(r) ? r.length : r && typeof r === 'object' && 'rows' in r ? (r as { rows: unknown[] }).rows.length : 1;
      }
      t.sort((a, b) => a - b);
      rows.push({ page, query, ms: Math.round(t[Math.floor(t.length / 2)] * 10) / 10, rows: n });
    };
    await time('Listing', 'venues in Mohali, page 1', () => browseVendors(db, { categoryId: cat.id, cityId: city.id }));
    await time('Listing', 'count for the same', () => countVendors(db, { categoryId: cat.id, cityId: city.id }));
    if (filter) await time('Listing', `filter: ${filter.label}`, () => browseVendors(db, { categoryId: cat.id, cityId: city.id, filter }));
    await time('Listing', 'sorted by rating', () => browseVendors(db, { categoryId: cat.id, cityId: city.id, sort: 'rating' }));
    await time('Listing', '4+ rated only', () => browseVendors(db, { categoryId: cat.id, cityId: city.id, minRating: 4 }));
    await time('Profile', 'vendor by slug', () => getVendorBySlug(db, busy.slug));
    await time('Profile', 'reviews', () => reviewsForVendor(db, busy.id));
    await time('Profile', 'similar vendors', () => similarVendors(db, { id: busy.id, category_id: busy.category_id, city_id: busy.city_id }));
    await time('Profile', 'demand note', () => recentDemand(db, busy.id));
    await time('Search', '"banquet"', () => searchVendors(db, 'banquet', null));
    await time('Search', '"load vendor 42"', () => searchVendors(db, 'load vendor 42', city.id));
    await time('Ideas', 'gallery page', () => ideaPhotos(db, { limit: 30 }));
    await time('Vendor dashboard', 'leads to unlock', () => needsForVendor(db, busy.id));
    await time('Vendor inbox', 'conversations', () => threadsForVendor(db, busy.id));
    await time('Conversation', 'messages', () => threadMessages(db, thread.id));
    await time('Vendor insights', '30 days', () => vendorInsights(db, busy.id, 30));
    await time('Bride inbox', 'conversations', () => threadsForBride(db, bride.id));
    for (const k of ['vendors', 'leads', 'needs', 'conversations', 'reviews']) {
      const d = dataset(k)!;
      await time('Ops data', `${d.label}, page 1`, () => runDataset(db, d, {}));
      await time('Ops data', `${d.label}, searched and filtered`, () => runDataset(db, d, { q: 'Bride 4', city: 'mohali', from: '2026-01-01' }));
    }
    const ctx = { db, profile: { id: bride.id, role: 'bride', full_name: 'Bride' }, wedding: null, threadId: '', slugs: new Set<string>(), actions: [] as string[] };
    await time('Ask Olready', 'search_vendors tool', () => runTool(ctx, 'search_vendors', { category: 'venues', city: 'mohali', guests: 400, max_price: 2000 }));
    await time('Ask Olready', 'price_guide tool', () => runTool(ctx, 'price_guide', { category: 'venues', city: 'mohali' }));

    const [counts] = await db`select (select count(*) from mkt.vendors)::int v, (select count(*) from mkt.leads)::int l, (select count(*) from mkt.lead_needs)::int n,
      (select count(*) from mkt.unlocks)::int u, (select count(*) from mkt.messages)::int m, (select count(*) from mkt.reviews)::int r`;
    const slow = rows.filter((r) => r.ms > 300);
    writeFileSync(
      path.resolve(__dirname, '../../docs/load-test.md'),
      [
        '# Load test',
        '',
        `Run on ${new Date().toISOString().slice(0, 10)} against a local Postgres 16 with ${counts.v.toLocaleString('en-IN')} vendors, ${counts.l.toLocaleString('en-IN')} leads, ${counts.n.toLocaleString('en-IN')} lead categories, ${counts.u.toLocaleString('en-IN')} unlocks, ${counts.m.toLocaleString('en-IN')} messages and ${counts.r.toLocaleString('en-IN')} reviews (\`scripts/load-seed.sql\`). Median of six runs; target under 300 ms.`,
        '',
        '| Page | Query | Median ms | Rows |',
        '| --- | --- | ---: | ---: |',
        ...rows.map((r) => `| ${r.page} | ${r.query} | ${r.ms} | ${r.rows} |`),
        '',
        slow.length ? `Over target: ${slow.map((r) => `${r.page} / ${r.query}`).join(', ')}.` : 'Every query is under target.',
        '',
      ].join('\n')
    );
    console.table(rows);
    expect(slow).toEqual([]);
  }, 600000);
});
