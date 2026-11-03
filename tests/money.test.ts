import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveVendor, profile, resetDb, testSql } from './helpers';
import { createOrder, createWalletOrder, markOrderPaid } from '@/lib/payments';
import { couponDiscount, createCoupon } from '@/lib/coupons';
import { refundOrder } from '@/lib/refunds';
import { walletBalance } from '@/lib/promotion';
import { codeAt, newSecret, verifyCode } from '@/lib/totp';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual','test')`;
});

const packId = async (code: string) => (await sql<{ id: number }[]>`select id from mkt.packs where code = ${code}`)[0].id;
const bal = async (vendorId: string, kind: string) =>
  (await sql<{ n: number }[]>`select coalesce(sum(delta),0)::int as n from mkt.credit_ledger where vendor_id = ${vendorId} and credit_kind = ${kind}`)[0].n;

describe('discount codes', () => {
  it('apply to the right purchases, count only paid uses, and never make an order free', async () => {
    const admin = await profile(sql, 'admin');
    const owner = await profile(sql, 'vendor', 'Coupon Lens');
    const v = await liveVendor(sql, owner.id, 'photographers', 'chandigarh', 'Coupon Lens');
    await createCoupon(sql, { code: 'tenoff', kind: 'percent', value: 10, maxDiscount: 400, minAmount: 1000, appliesTo: ['topup-10'], endsAt: null, maxUses: 2, perBuyer: 1, note: '' }, admin.id);
    await createCoupon(sql, { code: 'ALL-FREE', kind: 'fixed', value: 999999, maxDiscount: null, minAmount: 0, appliesTo: [], endsAt: null, maxUses: null, perBuyer: 5, note: '' }, admin.id);
    await expect(createCoupon(sql, { code: 'TENOFF', kind: 'percent', value: 5, maxDiscount: null, minAmount: 0, appliesTo: [], endsAt: null, maxUses: null, perBuyer: 1, note: '' }, admin.id)).rejects.toThrow(/already exists/);

    const { order } = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: await packId('topup-10'), gateway: 'manual', coupon: 'tenoff' });
    expect([order.amount_inr, order.discount_inr, order.coupon_code]).toEqual([4999 - 400, 400, 'TENOFF']);
    await expect(createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: await packId('pro'), gateway: 'manual', coupon: 'TENOFF' })).rejects.toThrow(/does not apply/);
    // Unpaid orders do not use the code up.
    await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: await packId('topup-10'), gateway: 'manual', coupon: 'TENOFF' });
    await markOrderPaid(sql, order.id, 'ref', owner.id);
    await expect(couponDiscount(sql, 'TENOFF', { product: 'topup-10', amount: 4999, profileId: owner.id })).rejects.toThrow(/already used/);
    const free = await couponDiscount(sql, 'ALL-FREE', { product: 'wallet', amount: 2000, profileId: owner.id });
    expect(free.discount).toBe(1999);
    const w = await createWalletOrder(sql, { profileId: owner.id, vendorId: v.id, amountInr: 2000, gateway: 'manual', coupon: 'ALL-FREE' });
    await markOrderPaid(sql, w.id, 'ref2', owner.id);
    expect(await walletBalance(sql, v.id)).toBe(2000); // full credit, discounted price
  });
});

describe('refunds', () => {
  it('records partial and full refunds, takes back unused credits, ends plans, never over-refunds', async () => {
    const admin = await profile(sql, 'admin');
    const owner = await profile(sql, 'vendor', 'Refund Decor');
    const v = await liveVendor(sql, owner.id, 'decorators', 'chandigarh', 'Refund Decor');
    const { order } = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: await packId('topup-10'), gateway: 'manual' });
    await expect(refundOrder(sql, order.id, { amount: 100, method: 'recorded', reference: 'x', reason: 'test', takeBackCredits: false, endPlan: false, takeBackWallet: false }, admin.id)).rejects.toThrow(/Only paid/);
    await markOrderPaid(sql, order.id, 'bank', owner.id);
    expect(await bal(v.id, 'topup')).toBe(10);
    await expect(refundOrder(sql, order.id, { amount: 1000, method: 'recorded', reference: '', reason: 'goodwill', takeBackCredits: false, endPlan: false, takeBackWallet: false }, admin.id)).rejects.toThrow(/reference/);
    await expect(refundOrder(sql, order.id, { amount: 1000, method: 'razorpay', reference: '', reason: 'goodwill', takeBackCredits: false, endPlan: false, takeBackWallet: false }, admin.id)).rejects.toThrow(/paid with manual/);
    await refundOrder(sql, order.id, { amount: 1000, method: 'recorded', reference: 'UTR1', reason: 'goodwill', takeBackCredits: false, endPlan: false, takeBackWallet: false }, admin.id);
    await expect(refundOrder(sql, order.id, { amount: 4000, method: 'recorded', reference: 'UTR2', reason: 'rest', takeBackCredits: true, endPlan: false, takeBackWallet: false }, admin.id)).rejects.toThrow(/At most ₹3,999/);
    const r = await refundOrder(sql, order.id, { amount: 3999, method: 'recorded', reference: 'UTR2', reason: 'rest', takeBackCredits: true, endPlan: false, takeBackWallet: false }, admin.id);
    expect(r.took).toEqual({ credits: 10 });
    expect(await bal(v.id, 'topup')).toBe(0);
    const [o] = await sql`select status, refunded_inr from mkt.orders where id = ${order.id}`;
    expect(o).toMatchObject({ status: 'refunded', refunded_inr: 4999 });
    const [mail] = await sql`select template from mkt.email_outbox where template = 'refund_issued' limit 1`;
    expect(mail).toBeTruthy();

    const plan = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: await packId('pro'), gateway: 'manual' });
    await markOrderPaid(sql, plan.order.id, 'bank', owner.id);
    const r2 = await refundOrder(sql, plan.order.id, { amount: 18999, method: 'recorded', reference: 'UTR3', reason: 'changed mind', takeBackCredits: true, endPlan: true, takeBackWallet: false }, admin.id);
    expect(r2.took).toEqual({ plan: 'cancelled' }); // no plan credits yet: it was waiting for the contract
  });
});

describe('authenticator codes', () => {
  it('matches RFC 6238 and accepts one step of clock drift', () => {
    // RFC 6238 test secret "12345678901234567890" in base32, at T = 59 s.
    expect(codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
    const s = newSecret();
    const now = Date.now();
    const step = Math.floor(now / 30000);
    expect(verifyCode(s, codeAt(s, step), now)).toBe(step);
    expect(verifyCode(s, codeAt(s, step - 1), now)).toBe(step - 1);
    expect(verifyCode(s, codeAt(s, step - 3), now)).toBeNull();
    expect(verifyCode(s, '12345', now)).toBeNull();
  });
});
