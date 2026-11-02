import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveVendor, profile, resetDb, testSql } from './helpers';
import { expirePlans, payuRequestFields, payuResponseValid, razorpayCheckoutValid, razorpayWebhookValid, type Order } from '@/lib/payments';
import { balances } from '@/lib/leads';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => {
  resetDb();
  process.env.RAZORPAY_KEY_SECRET = 'rzp_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_hook';
  process.env.PAYU_KEY = 'payukey';
  process.env.PAYU_SALT = 'payusalt';
});

describe('gateway signatures', () => {
  it('accepts genuine Razorpay checkout and webhook signatures and rejects tampered ones', () => {
    const sig = createHmac('sha256', 'rzp_secret').update('order_1|pay_1').digest('hex');
    expect(razorpayCheckoutValid('order_1', 'pay_1', sig)).toBe(true);
    expect(razorpayCheckoutValid('order_1', 'pay_2', sig)).toBe(false);
    const body = '{"event":"payment.captured"}';
    const hook = createHmac('sha256', 'rzp_hook').update(body).digest('hex');
    expect(razorpayWebhookValid(body, hook)).toBe(true);
    expect(razorpayWebhookValid(body + ' ', hook)).toBe(false);
  });

  it('signs PayU requests and verifies PayU responses', () => {
    const order = { id: 'txn-1', amount_inr: 4999 } as Order;
    const req = payuRequestFields(order, 'Top-up 10', { name: 'Kirti Sharma', email: 'k@demo.in', phone: '98' }, 'https://olready.in');
    const expected = createHash('sha512').update('payukey|txn-1|4999.00|OLReady Top-up 10|Kirti|k@demo.in|||||||||||payusalt').digest('hex');
    expect(req.fields.hash).toBe(expected);
    const resp: Record<string, string> = { status: 'success', email: 'k@demo.in', firstname: 'Kirti', productinfo: 'OLReady Top-up 10', amount: '4999.00', txnid: 'txn-1', key: 'payukey' };
    resp.hash = createHash('sha512').update(['payusalt', 'success', '', '', '', '', '', '', '', '', '', '', 'k@demo.in', 'Kirti', 'OLReady Top-up 10', '4999.00', 'txn-1', 'payukey'].join('|')).digest('hex');
    expect(payuResponseValid(resp)).toBe(true);
    expect(payuResponseValid({ ...resp, amount: '1.00' })).toBe(false);
  });
});

describe('plan expiry', () => {
  it('writes off unused plan credits when the last plan ends, but keeps top-ups', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    const [pro] = await sql`select id from mkt.packs where code = 'pro'`;
    await sql`insert into mkt.vendor_subscriptions (vendor_id, pack_id, status, starts_at, ends_at)
      values (${v.id}, ${pro.id}, 'active', now() - interval '91 days', now() - interval '1 day')`;
    await sql`insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason) values
      (${v.id}, 'plan', 60, 'purchase'), (${v.id}, 'plan', -12, 'unlock'), (${v.id}, 'topup', 5, 'purchase')`;
    const r = await expirePlans(sql);
    expect(r).toMatchObject({ ended: 1, writtenOff: 48 });
    const b = await balances(sql, v.id);
    expect(b).toMatchObject({ plan: 0, topup: 5, planUsable: false });
    expect((await expirePlans(sql)).writtenOff).toBe(0);
  });
});
