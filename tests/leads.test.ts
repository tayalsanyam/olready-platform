import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import {
  advanceVerification,
  balances,
  closeNeedByBride,
  createEnquiry,
  markLeadFake,
  reopenNeed,
  reportBooking,
  unlockNeed,
  visibleNeeds,
} from '@/lib/leads';
import { activateSubscription, createOrder, markOrderPaid } from '@/lib/payments';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

async function verifiedLead(cats: { slug: string; budget?: number }[], city = 'chandigarh') {
  const ops = await profile(sql, 'ops');
  const bride = await profile(sql, 'bride', 'Simran Kaur');
  const needs = [];
  for (const c of cats) needs.push({ categoryId: await categoryId(sql, c.slug), budgetInr: c.budget ?? null });
  const lead = await createEnquiry(sql, {
    brideProfileId: bride.id,
    name: 'Simran Kaur',
    phone: '98765 43210',
    cityId: await cityId(sql, city),
    eventDate: '2027-02-14',
    needs,
  });
  await advanceVerification(sql, lead.id, 1, ops.id);
  await advanceVerification(sql, lead.id, 2, ops.id);
  await advanceVerification(sql, lead.id, 3, ops.id);
  const rows = await sql<{ id: string; category_id: number; unlock_cap: number; budget_tier_id: number | null }[]>`
    select id, category_id, unlock_cap, budget_tier_id from mkt.lead_needs where lead_id = ${lead.id}`;
  return { lead, bride, ops, needs: rows };
}

describe('multi-category enquiry', () => {
  it('creates one need per category with the category cap and a budget tier', async () => {
    const { lead, needs } = await verifiedLead([{ slug: 'bridal-makeup', budget: 25000 }, { slug: 'photographers' }, { slug: 'mehendi-artists' }]);
    expect(lead.phone).toBe('+919876543210');
    expect(needs).toHaveLength(3);
    const caps = Object.fromEntries(
      await Promise.all(needs.map(async (n) => [n.category_id, n.unlock_cap] as const))
    );
    expect(caps[await categoryId(sql, 'bridal-makeup')]).toBe(20);
    expect(caps[await categoryId(sql, 'photographers')]).toBe(8);
    const [tier] = await sql`select bt.code from mkt.lead_needs ln join mkt.budget_tiers bt on bt.id = ln.budget_tier_id
      where ln.lead_id = ${lead.id} and ln.category_id = ${await categoryId(sql, 'bridal-makeup')}`;
    expect(tier.code).toBe('premium');
  });

  it('rejects inactive categories and bad phones', async () => {
    await expect(
      createEnquiry(sql, { name: 'A', phone: '123', cityId: await cityId(sql, 'chandigarh'), needs: [{ categoryId: await categoryId(sql, 'bridal-makeup') }] })
    ).rejects.toThrow(/valid mobile/);
    await expect(
      createEnquiry(sql, { name: 'A', phone: '9876543210', cityId: await cityId(sql, 'chandigarh'), needs: [{ categoryId: await categoryId(sql, 'florists') }] })
    ).rejects.toThrow(/not open/);
  });

  it('hides unverified leads from vendors', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'decorators');
    await createEnquiry(sql, { name: 'B', phone: '9876543211', cityId: await cityId(sql, 'chandigarh'), needs: [{ categoryId: await categoryId(sql, 'decorators') }] });
    expect(await visibleNeeds(sql, v.id)).toHaveLength(0);
  });
});

describe('unlocking', () => {
  it('shows a verified need only to vendors in that category and city', async () => {
    const { needs } = await verifiedLead([{ slug: 'djs-dhol' }]);
    const dj = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'djs-dhol');
    const djLudhiana = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'djs-dhol', 'ludhiana');
    const mua = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'bridal-makeup');
    expect((await visibleNeeds(sql, dj.id)).map((n) => n.need_id)).toContain(needs[0].id);
    expect((await visibleNeeds(sql, djLudhiana.id)).map((n) => n.need_id)).not.toContain(needs[0].id);
    expect((await visibleNeeds(sql, mua.id)).map((n) => n.need_id)).not.toContain(needs[0].id);
  });

  it('spends the category credit cost, opens a thread, and refuses without credits', async () => {
    const { needs } = await verifiedLead([{ slug: 'photographers' }]);
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'photographers');
    await expect(unlockNeed(sql, needs[0].id, v.id, owner.id)).rejects.toThrow(/need 2 credits/);
    await topup(sql, v.id, 3);
    const r = await unlockNeed(sql, needs[0].id, v.id, owner.id);
    expect(r.cost).toBe(2);
    expect(r.threadId).toBeTruthy();
    expect((await balances(sql, v.id)).topup).toBe(1);
    await expect(unlockNeed(sql, needs[0].id, v.id, owner.id)).rejects.toThrow(/not open|already/);
  });

  it('caps a need, then reopens it twice at most, ten unlocks each time', async () => {
    const { needs, ops } = await verifiedLead([{ slug: 'photographers' }]);
    const need = needs[0];
    const vendors = [];
    for (let i = 0; i < 8; i++) {
      const o = await profile(sql, 'vendor');
      const v = await liveVendor(sql, o.id, 'photographers', 'chandigarh', `Cap Vendor ${i}`);
      await topup(sql, v.id, 10);
      vendors.push({ o, v });
      await unlockNeed(sql, need.id, v.id, o.id);
    }
    const [n1] = await sql`select status, unlock_cap from mkt.lead_needs where id = ${need.id}`;
    expect(n1.status).toBe('capped');
    const extra = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'photographers');
    await topup(sql, extra.id, 10);
    await expect(unlockNeed(sql, need.id, extra.id, ops.id)).rejects.toThrow(/no longer open/);
    await reopenNeed(sql, need.id, ops.id);
    const [n2] = await sql`select status, unlock_cap, reopen_rounds from mkt.lead_needs where id = ${need.id}`;
    expect(n2).toMatchObject({ status: 'open', unlock_cap: 18, reopen_rounds: 1 });
    await sql`update mkt.lead_needs set status = 'capped' where id = ${need.id}`;
    await reopenNeed(sql, need.id, ops.id);
    await sql`update mkt.lead_needs set status = 'capped' where id = ${need.id}`;
    await expect(reopenNeed(sql, need.id, ops.id)).rejects.toThrow(/already been reopened 2 times/);
  });

  it('never overdraws when two unlocks race on one balance', async () => {
    const { needs: a } = await verifiedLead([{ slug: 'mehendi-artists' }]);
    const { needs: b } = await verifiedLead([{ slug: 'mehendi-artists' }]);
    const o = await profile(sql, 'vendor');
    const v = await liveVendor(sql, o.id, 'mehendi-artists');
    await topup(sql, v.id, 1);
    const results = await Promise.allSettled([unlockNeed(sql, a[0].id, v.id, o.id), unlockNeed(sql, b[0].id, v.id, o.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await balances(sql, v.id)).topup).toBe(0);
  });

  it('direct requests are visible only to the chosen vendor, with a cap of one', async () => {
    const chosen = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'bridal-makeup');
    const other = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'bridal-makeup');
    const ops = await profile(sql, 'ops');
    const lead = await createEnquiry(sql, {
      name: 'Direct Bride', phone: '9876500000', cityId: await cityId(sql, 'chandigarh'),
      needs: [{ categoryId: await categoryId(sql, 'bridal-makeup') }], directVendorId: chosen.id,
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    expect((await visibleNeeds(sql, chosen.id)).some((n) => n.direct)).toBe(true);
    expect((await visibleNeeds(sql, other.id)).some((n) => n.lead_id === lead.id)).toBe(false);
  });
});

describe('fake leads and bookings', () => {
  it('refunds only the unlocks Ops selects', async () => {
    const { lead, needs, ops } = await verifiedLead([{ slug: 'decorators' }]);
    const a = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'decorators');
    const b = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'decorators');
    await topup(sql, a.id, 2);
    await topup(sql, b.id, 2);
    const ua = await unlockNeed(sql, needs[0].id, a.id, ops.id);
    await unlockNeed(sql, needs[0].id, b.id, ops.id);
    const r = await markLeadFake(sql, lead.id, [ua.unlockId], ops.id, 'wrong number');
    expect(r.refunded).toBe(1);
    expect((await balances(sql, a.id)).topup).toBe(2);
    expect((await balances(sql, b.id)).topup).toBe(0);
    const [n] = await sql`select status from mkt.lead_needs where id = ${needs[0].id}`;
    expect(n.status).toBe('removed');
  });

  it('either side confirms a booking; only the reporter is rewarded', async () => {
    const { needs, bride } = await verifiedLead([{ slug: 'bridal-makeup' }]);
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    await topup(sql, v.id, 1);
    await unlockNeed(sql, needs[0].id, v.id, owner.id);
    await reportBooking(sql, { needId: needs[0].id, vendorId: v.id, reporterProfileId: bride.id, side: 'bride' });
    const [n] = await sql`select status, booked_vendor_id from mkt.lead_needs where id = ${needs[0].id}`;
    expect(n).toMatchObject({ status: 'closed_booked', booked_vendor_id: v.id });
    expect((await balances(sql, v.id)).topup).toBe(0);
    const perks = await sql`select perk from mkt.bride_perks where profile_id = ${bride.id}`;
    expect(perks.map((p) => p.perk)).toEqual(['rm_access_7d']);
    await reportBooking(sql, { needId: needs[0].id, vendorId: v.id, reporterProfileId: owner.id, side: 'vendor' });
    expect((await balances(sql, v.id)).topup).toBe(1);
    await expect(
      reportBooking(sql, { needId: needs[0].id, vendorId: v.id, reporterProfileId: owner.id, side: 'vendor' })
    ).rejects.toThrow(/already been reported/);
  });

  it('refuses a booking report from a vendor who never unlocked', async () => {
    const { needs } = await verifiedLead([{ slug: 'bridal-makeup' }]);
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    await expect(
      reportBooking(sql, { needId: needs[0].id, vendorId: v.id, reporterProfileId: owner.id, side: 'vendor' })
    ).rejects.toThrow(/unlocked/);
  });

  it('lets the bride close a category booked outside Olready', async () => {
    const { needs, bride } = await verifiedLead([{ slug: 'djs-dhol' }]);
    await closeNeedByBride(sql, needs[0].id, bride.id, { vendorName: 'DJ Local', reason: 'cheaper' });
    const [n] = await sql`select status, booked_outside from mkt.lead_needs where id = ${needs[0].id}`;
    expect(n.status).toBe('closed_by_bride');
    expect(n.booked_outside).toEqual({ vendor_name: 'DJ Local', reason: 'cheaper' });
    const stranger = await profile(sql, 'bride');
    await expect(closeNeedByBride(sql, needs[0].id, stranger.id, null)).rejects.toThrow(/Not your/);
  });
});

describe('packs and plans', () => {
  it('top-ups credit on payment; plans wait for invoice and contract', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    await sql`update mkt.gateway_settings set enabled = true where gateway = 'manual'`;
    const [topupPack] = await sql`select id from mkt.packs where code = 'topup-10'`;
    const [proPack] = await sql`select id from mkt.packs where code = 'pro'`;
    const t = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: topupPack.id, gateway: 'manual' });
    await markOrderPaid(sql, t.order.id, 'bank-ref-1', null);
    await markOrderPaid(sql, t.order.id, 'bank-ref-1', null); // idempotent
    expect((await balances(sql, v.id)).topup).toBe(10);

    const p = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: proPack.id, gateway: 'manual' });
    await markOrderPaid(sql, p.order.id, 'bank-ref-2', null);
    expect((await balances(sql, v.id)).plan).toBe(0);
    const [sub] = await sql`select id, status from mkt.vendor_subscriptions where order_id = ${p.order.id}`;
    expect(sub.status).toBe('pending_contract');
    await expect(activateSubscription(sql, sub.id, 'https://x/invoice.pdf', '', owner.id)).rejects.toThrow(/signed contract/);
    await activateSubscription(sql, sub.id, 'https://x/invoice.pdf', 'https://x/contract.pdf', owner.id);
    const b = await balances(sql, v.id);
    expect(b).toMatchObject({ plan: 60, planUsable: true, planTiers: 'all' });
  });

  it('refuses disabled gateways and malformed GSTINs', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    const [pack] = await sql`select id from mkt.packs where code = 'topup-10'`;
    await sql`update mkt.gateway_settings set enabled = false where gateway = 'razorpay'`;
    await expect(createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: pack.id, gateway: 'razorpay' })).rejects.toThrow(/temporarily unavailable/);
    await expect(
      createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: pack.id, gateway: 'manual', buyerGstin: 'BAD' })
    ).rejects.toThrow(/GSTIN/);
  });

  it('spends tier-restricted plan credits only on allowed tiers, falling back to top-ups', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    const [pack] = await sql`
      insert into mkt.packs (code, name, kind, credits, price_inr, validity_days, tier_codes, requires_contract)
      values ('value-only', 'Value only', 'plan', 5, 1000, 30, '{value}', false) returning id`;
    await sql`insert into mkt.vendor_subscriptions (vendor_id, pack_id, status, starts_at, ends_at)
      values (${v.id}, ${pack.id}, 'active', now(), now() + interval '30 days')`;
    await sql`insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason) values (${v.id}, 'plan', 5, 'purchase')`;
    await topup(sql, v.id, 1);
    const { needs: luxe } = await verifiedLead([{ slug: 'bridal-makeup', budget: 60000 }]);
    const { needs: value } = await verifiedLead([{ slug: 'bridal-makeup', budget: 9000 }]);
    expect((await unlockNeed(sql, luxe[0].id, v.id, owner.id)).creditKind).toBe('topup');
    expect((await unlockNeed(sql, value[0].id, v.id, owner.id)).creditKind).toBe('plan');
  });
});
