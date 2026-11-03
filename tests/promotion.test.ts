import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { createWalletOrder, markOrderPaid } from '@/lib/payments';
import {
  adjustWallet,
  bookBanner,
  bookableMonths,
  cancelBanner,
  createBoost,
  decideBanner,
  liveBanners,
  recordBoostVisit,
  setBoostStatus,
  sponsored,
  walletBalance,
} from '@/lib/promotion';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual','test')`;
});

async function vendorWithWallet(name: string, amount = 2000) {
  const owner = await profile(sql, 'vendor', name);
  const v = await liveVendor(sql, owner.id, 'photographers', 'chandigarh', name);
  const [full] = await sql`select * from mkt.vendors where id = ${v.id}`;
  const order = await createWalletOrder(sql, { profileId: owner.id, vendorId: v.id, amountInr: amount, gateway: 'manual' });
  await markOrderPaid(sql, order.id, 'bank-ref', owner.id);
  return { owner, v: { ...full, slug: v.slug } as never as { id: string; slug: string; status: string; city_id: number; service_city_ids: number[] } };
}

describe('ads wallet and Boosts', () => {
  it('a paid top-up becomes wallet credit, once', async () => {
    const { owner, v } = await vendorWithWallet('Lens Promo');
    expect(await walletBalance(sql, v.id)).toBe(2000);
    await expect(createWalletOrder(sql, { profileId: owner.id, vendorId: v.id, amountInr: 1234, gateway: 'manual' })).rejects.toThrow(/Pick a top-up/);
    const [o] = await sql<{ id: string }[]>`select id from mkt.orders where vendor_id = ${v.id}`;
    await markOrderPaid(sql, o.id, 'again', owner.id);
    expect(await walletBalance(sql, v.id)).toBe(2000);
  });

  it('charges once per visitor per day, stops at the daily budget, and only shows while affordable', async () => {
    const { owner, v } = await vendorWithWallet('Boosted Lens');
    const city = await cityId(sql, 'chandigarh');
    await expect(createBoost(sql, v, { placements: [], cityIds: [], dailyBudget: 100, startsOn: '', endsOn: null }, owner.id)).rejects.toThrow(/Pick where/);
    await expect(createBoost(sql, v, { placements: ['search'], cityIds: [await cityId(sql, 'ludhiana')], dailyBudget: 100, startsOn: '', endsOn: null }, owner.id)).rejects.toThrow(/only cities you serve/);
    const id = await createBoost(sql, v, { placements: ['search'], cityIds: [], dailyBudget: 50, startsOn: '', endsOn: null }, owner.id);

    const shown = await sponsored(sql, { categoryId: await categoryId(sql, 'photographers'), cityId: city, placement: 'search', limit: 5 });
    expect(shown.map((s) => s.boost_id)).toContain(id);
    expect(await sponsored(sql, { categoryId: await categoryId(sql, 'photographers'), cityId: city, placement: 'home' })).toHaveLength(0);

    expect(await recordBoostVisit(sql, id, 'visitor-a', 'search')).toBe(v.slug);
    await recordBoostVisit(sql, id, 'visitor-a', 'search'); // same person, same day: free
    await recordBoostVisit(sql, id, 'visitor-b', 'search');
    await recordBoostVisit(sql, id, null, 'search'); // bots are never charged
    expect(await walletBalance(sql, v.id)).toBe(2000 - 30);
    await recordBoostVisit(sql, id, 'visitor-c', 'search');
    await recordBoostVisit(sql, id, 'visitor-d', 'search'); // would pass ₹50: not charged
    expect(await walletBalance(sql, v.id)).toBe(2000 - 45);
    expect((await sponsored(sql, { categoryId: await categoryId(sql, 'photographers'), cityId: city, placement: 'search', limit: 5 })).map((s) => s.boost_id)).not.toContain(id);

    const ops = await profile(sql, 'ops');
    await setBoostStatus(sql, id, 'paused', { actor: ops.id, ops: true });
    await expect(setBoostStatus(sql, id, 'active', { actor: owner.id, vendorId: v.id })).rejects.toThrow(/Our team paused/);
  });

  it('banners: paid on booking, refunded on rejection or cancel, slots are limited', async () => {
    const month = bookableMonths()[0];
    const { owner, v } = await vendorWithWallet('Banner Lens', 10000);
    const city = await cityId(sql, 'chandigarh');
    const b1 = await bookBanner(sql, v, { placement: 'city', cityId: city, month, headline: 'Candid stories, beautifully told', imageUrl: '/demo/demo-1.jpg' }, owner.id);
    expect(await walletBalance(sql, v.id)).toBe(5000);
    await expect(bookBanner(sql, v, { placement: 'home', cityId: null, month, headline: 'Too expensive for me', imageUrl: '/x.jpg' }, owner.id)).rejects.toThrow(/You need ₹12,000/);
    const ops = await profile(sql, 'ops');
    expect(await liveBanners(sql, 'city', city)).toHaveLength(0);
    await decideBanner(sql, b1, true, '', ops.id);
    if (month === bookableMonths()[0] && new Date(`${month}T00:00:00Z`).getUTCMonth() === new Date(Date.now() + 5.5 * 3600e3).getUTCMonth()) {
      expect((await liveBanners(sql, 'city', city)).map((b) => b.id)).toContain(b1);
    }
    const b2 = await bookBanner(sql, v, { placement: 'city', cityId: city, month, headline: 'Second banner for review', imageUrl: '/demo/demo-2.jpg' }, owner.id);
    await expect(decideBanner(sql, b2, false, '', ops.id)).rejects.toThrow(/Tell the vendor why/);
    await decideBanner(sql, b2, false, 'Image has text that is too small', ops.id);
    expect(await walletBalance(sql, v.id)).toBe(5000);
    const b3 = await bookBanner(sql, v, { placement: 'city', cityId: city, month, headline: 'Third banner, then cancel', imageUrl: '/demo/demo-3.jpg' }, owner.id);
    await cancelBanner(sql, b3, v.id, owner.id);
    expect(await walletBalance(sql, v.id)).toBe(5000);
    await sql`update mkt.settings set value = '1' where key = 'banner_slots'`;
    await expect(bookBanner(sql, v, { placement: 'city', cityId: city, month, headline: 'No slot left this month', imageUrl: '/x.jpg' }, owner.id)).rejects.toThrow(/fully booked/);
    await expect(adjustWallet(sql, v.id, -999999, 'oops', ops.id)).rejects.toThrow(/below zero/);
  });
});
