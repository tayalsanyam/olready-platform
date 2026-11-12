import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { leadBook, leadBookCounts, vendorBook, vendorBookCounts, type VendorTab } from '@/lib/opsBooks';
import { offersFor, offersFromForm, priceLine, saveOffers } from '@/lib/offers';
import { fieldsFor } from '@/lib/catalog';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const sub = async (vendorId: string, code: string, status: string, start: number | null, end: number | null, left = 0) => {
  await sql`insert into mkt.vendor_subscriptions (vendor_id, pack_id, status, starts_at, ends_at)
    select ${vendorId}, id, ${status}, ${start == null ? null : sql`now() + ${start} * interval '1 day'`}, ${end == null ? null : sql`now() + ${end} * interval '1 day'`}
    from mkt.packs where code = ${code}`;
  if (left) await sql`insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason) values (${vendorId}, 'plan', ${left}, 'adjustment')`;
};

describe('the vendor book', () => {
  it('puts each vendor in the groups its plan and status call for', async () => {
    const mk = async (name: string) => (await liveVendor(sql, (await profile(sql, 'vendor', name)).id, 'bridal-makeup', 'chandigarh', name)).id as string;
    const onPace = await mk('On Pace');
    const ending = await mk('Ending Soon');
    const lapsed = await mk('Lapsed');
    const waiting = await mk('Waiting Contract');
    const fresh = await mk('Fresh No Plan');
    const old = await mk('Old No Plan');
    await sql`update mkt.vendors set created_at = now() - interval '90 days', verified_at = now() - interval '80 days' where id in ${sql([onPace, ending, lapsed, old])}`;
    await sub(onPace, 'phoenix', 'active', -18, 162, 90); // 10% through, 10 of 100 used
    await sub(ending, 'pro', 'active', -80, 10, 55); // 89% through, 5 of 60 used
    await sub(lapsed, 'pro', 'expired', -120, -30);
    await sub(waiting, 'pro', 'pending_contract', null, null);

    const names = async (tab: VendorTab) => (await vendorBook(sql, { tab })).map((v) => v.business_name).sort();
    expect(await names('plan')).toEqual(['Ending Soon', 'On Pace']);
    expect(await names('ending')).toEqual(['Ending Soon']);
    expect(await names('behind')).toEqual(['Ending Soon']);
    expect(await names('lapsed')).toEqual(['Lapsed']);
    expect(await names('contract')).toEqual(['Waiting Contract']);
    expect(await names('noplan')).toEqual(['Fresh No Plan', 'Old No Plan']);
    expect(await names('new')).toEqual(['Fresh No Plan', 'Waiting Contract']);
    expect((await names('all')).length).toBe(6);

    const counts = await vendorBookCounts(sql);
    expect(counts).toMatchObject({ plan: 2, ending: 1, behind: 1, lapsed: 1, contract: 1, noplan: 2, new: 2, all: 6, review: 0, draft: 0 });

    const [row] = await vendorBook(sql, { tab: 'ending' });
    expect(row).toMatchObject({ plan: 'Pro', plan_credits: 60, plan_used: 5, plan_days_left: 10, behind: true, credits: 55 });
    // Search by name and by the digits of a phone number.
    expect((await vendorBook(sql, { tab: 'all', q: 'lapsed' })).map((v) => v.business_name)).toEqual(['Lapsed']);
    expect(await vendorBook(sql, { tab: 'all', q: 'nobody-by-this-name' })).toEqual([]);
  });
});

describe('the lead book', () => {
  it('sorts requests by where they stand', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const mua = await categoryId(sql, 'bridal-makeup');
    const lead = async (name: string, phone: string, status: string, need: string, verifiedDaysAgo: number | null = null) => {
      const [l] = await sql<{ id: string }[]>`insert into mkt.leads (bride_name, phone, city_id, source, status, verified_at)
        values (${name}, ${phone}, ${chd}, 'instagram', ${status}, ${verifiedDaysAgo == null ? null : sql`now() - ${verifiedDaysAgo} * interval '1 day'`}) returning id`;
      await sql`insert into mkt.lead_needs (lead_id, category_id, unlock_cap, status) values (${l.id}, ${mua}, 5, ${need})`;
      return l.id;
    };
    await lead('New One', '+919811100001', 'new', 'open');
    await lead('Live Fresh', '+919811100002', 'verified', 'open', 0);
    await lead('Live Quiet', '+919811100003', 'verified', 'open', 5);
    await lead('Full Up', '+919811100004', 'verified', 'capped', 3);
    await lead('Booked', '+919811100005', 'verified', 'closed_booked', 9);
    await lead('Fake', '+919811100006', 'fake', 'open');

    const names = async (tab: Parameters<typeof leadBook>[1]['tab']) => (await leadBook(sql, { tab })).map((l) => l.bride_name).sort();
    expect(await names('verify')).toEqual(['New One']);
    expect(await names('live')).toEqual(['Live Fresh', 'Live Quiet']);
    expect(await names('quiet')).toEqual(['Live Quiet']);
    expect(await names('capped')).toEqual(['Full Up']);
    expect(await names('booked')).toEqual(['Booked']);
    expect(await names('closed')).toEqual(['Fake']);
    expect(await leadBookCounts(sql)).toMatchObject({ verify: 1, live: 2, quiet: 1, capped: 1, booked: 1, closed: 1, all: 6, call: 0 });
    const [row] = await leadBook(sql, { tab: 'capped', q: '100004' });
    expect(row.needs).toEqual([{ category: 'Bridal makeup artist', status: 'capped', cap: 5, unlocks: 0, quotes: 0 }]);
    expect(await leadBook(sql, { tab: 'all', source: 'website' })).toEqual([]);
  });
});

describe('what each trade fills in', () => {
  it('gives a makeup artist products and looks, a caterer menus', async () => {
    const fields = await fieldsFor(sql, await categoryId(sql, 'bridal-makeup'));
    const brands = fields.find((f) => f.key === 'brands')!;
    expect(brands).toMatchObject({ type: 'multiselect', section: 'Products you use' });
    expect(brands.options.map((o) => o.label)).toContain('MAC');
    expect(new Set(fields.map((f) => f.section))).toEqual(new Set(['Looks you do', 'Products you use', 'What is included', 'How you work']));
    const every = await sql<{ slug: string; n: number; presets: number }[]>`
      select c.slug, (select count(*) from mkt.category_fields f where f.category_id = c.id and f.section is not null)::int as n,
        jsonb_array_length(c.offer_presets) as presets from mkt.categories c where c.active`;
    for (const c of every) expect(c.n, c.slug).toBeGreaterThanOrEqual(4);
    for (const c of every) expect(c.presets, c.slug).toBeGreaterThanOrEqual(3);
  });

  it('keeps a price list clean and in order', async () => {
    const owner = await profile(sql, 'vendor', 'Price Lister');
    const v = await liveVendor(sql, owner.id, 'caterers', 'chandigarh', 'Price Lister');
    const fd = new FormData();
    fd.set('offer_name_0', '  Vegetarian   menu ');
    fd.set('offer_price_0', '₹850');
    fd.set('offer_unit_0', 'plate');
    fd.set('offer_onwards_0', 'on');
    fd.set('offer_name_2', 'Custom dessert table');
    fd.set('offer_unit_2', 'nonsense');
    fd.set('offer_name_3', 'x'); // too short to be a line
    const lines = offersFromForm(fd);
    expect(lines).toEqual([
      { name: 'Vegetarian menu', price_inr: 850, unit: 'plate', onwards: true, details: '' },
      { name: 'Custom dessert table', price_inr: null, unit: 'event', onwards: false, details: '' },
    ]);
    await saveOffers(sql, v.id, lines, owner.id);
    await saveOffers(sql, v.id, lines, owner.id); // saving again replaces, never doubles
    const saved = await offersFor(sql, v.id);
    expect(saved.map((o) => o.name)).toEqual(['Vegetarian menu', 'Custom dessert table']);
    expect(saved.map(priceLine)).toEqual(['₹850 onwards per plate', 'On request']);

    const bad = new FormData();
    bad.set('offer_name_0', 'Call 98765 43210 for rates');
    expect(() => offersFromForm(bad)).toThrow(/phone numbers/);
    const many = new FormData();
    for (let i = 0; i < 13; i++) many.set(`offer_name_${i}`, `Line ${i}`);
    expect(() => offersFromForm(many)).toThrow(/up to 12/);
  });
});
