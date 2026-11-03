import { createHash } from 'node:crypto';
import type { Sql } from './db';
import { DomainError, audit } from './db';
import type { Order } from './payments';
import { queueEmail } from './email';
import { issueCreditNote } from './invoices';

export type RefundInput = {
  amount: number;
  method: 'razorpay' | 'payu' | 'recorded';
  reference: string;
  reason: string;
  takeBackCredits: boolean;
  endPlan: boolean;
  takeBackWallet: boolean;
};

async function razorpayRefund(paymentId: string, amountInr: number, orderId: string) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountInr * 100, notes: { order_id: orderId } }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new DomainError('gateway', `Razorpay refused the refund: ${body.error?.description ?? res.status}`);
  return body.id;
}

async function payuRefund(mihpayid: string, amountInr: number, orderId: string) {
  const key = process.env.PAYU_KEY ?? '';
  const salt = process.env.PAYU_SALT ?? '';
  const command = 'cancel_refund_transaction';
  const hash = createHash('sha512').update(`${key}|${command}|${mihpayid}|${salt}`).digest('hex');
  const form = new URLSearchParams({ key, command, var1: mihpayid, var2: `r-${orderId.slice(0, 8)}-${Date.now()}`, var3: amountInr.toFixed(2), hash });
  const base = (process.env.PAYU_BASE_URL ?? 'https://secure.payu.in').includes('test') ? 'https://test.payu.in' : 'https://info.payu.in';
  const res = await fetch(`${base}/merchant/postservice.php?form=2`, { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as { status?: number; msg?: string; request_id?: string };
  if (!res.ok || body.status !== 1) throw new DomainError('gateway', `PayU refused the refund: ${body.msg ?? res.status}`);
  return body.request_id ?? 'payu';
}

/**
 * Refunds all or part of a paid order, through the gateway or recorded (already done in the
 * gateway dashboard or by bank transfer). Can take back what the order gave: unused credits,
 * the plan itself, wallet credit, or a relationship-manager request. Never more than was paid.
 */
export async function refundOrder(sql: Sql, orderId: string, i: RefundInput, actor: string) {
  const reason = i.reason.trim();
  if (reason.length < 3) throw new DomainError('reason', 'Say why the money is going back');
  if (!Number.isInteger(i.amount) || i.amount <= 0) throw new DomainError('amount', 'Enter the amount in whole rupees');
  if (i.method === 'recorded' && !i.reference.trim()) throw new DomainError('reference', 'Add the refund reference from the gateway or bank');

  // Check first, outside the transaction, so a gateway call is never made for a refund we would refuse.
  const [o] = await sql<Order[]>`select * from mkt.orders where id = ${orderId}`;
  if (!o) throw new DomainError('not_found', 'Order not found');
  if (o.status !== 'paid') throw new DomainError('state', 'Only paid orders can be refunded');
  if (i.amount > o.amount_inr - o.refunded_inr) throw new DomainError('too_much', `At most ₹${(o.amount_inr - o.refunded_inr).toLocaleString('en-IN')} is left to refund`);
  if (i.method !== 'recorded' && i.method !== o.gateway) throw new DomainError('method', `This order was paid with ${o.gateway}; refund it there or record it`);
  if (i.method !== 'recorded' && !o.gateway_payment_id) throw new DomainError('payment_id', 'No gateway payment id on this order; record the refund instead');

  const gatewayId =
    i.method === 'razorpay' ? await razorpayRefund(o.gateway_payment_id!, i.amount, o.id) : i.method === 'payu' ? await payuRefund(o.gateway_payment_id!, i.amount, o.id) : null;

  return sql.begin(async (tx) => {
    const [cur] = await tx<Order[]>`select * from mkt.orders where id = ${orderId} for update`;
    if (i.amount > cur.amount_inr - cur.refunded_inr) throw new DomainError('too_much', 'Someone refunded this order a moment ago; check the history');
    const took: Record<string, unknown> = {};
    if (cur.vendor_id && cur.pack_id && (i.takeBackCredits || i.endPlan)) {
      const [pack] = await tx<{ kind: 'plan' | 'topup'; credits: number; name: string }[]>`select kind, credits, name from mkt.packs where id = ${cur.pack_id}`;
      const kind = pack.kind === 'topup' ? 'topup' : 'plan';
      const [{ bal }] = await tx<{ bal: number }[]>`select coalesce(sum(delta), 0)::int as bal from mkt.credit_ledger where vendor_id = ${cur.vendor_id} and credit_kind = ${kind}`;
      const back = Math.min(bal, pack.credits);
      if (back > 0) {
        await tx`insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, ref_id, note, created_by)
          values (${cur.vendor_id}, ${kind}, ${-back}, 'adjustment', ${cur.id}, ${`Refund of ${pack.name}`}, ${actor})`;
        took.credits = back;
      }
      if (i.endPlan && pack.kind === 'plan') {
        const ended = await tx`update mkt.vendor_subscriptions set status = 'cancelled' where order_id = ${cur.id} and status in ('active','pending_contract') returning id`;
        if (ended.length) took.plan = 'cancelled';
      }
    }
    if (cur.vendor_id && cur.wallet_topup_inr && i.takeBackWallet) {
      const [{ bal }] = await tx<{ bal: number }[]>`select coalesce(sum(delta_inr), 0)::int as bal from mkt.ad_wallet_ledger where vendor_id = ${cur.vendor_id}`;
      const back = Math.min(bal, cur.wallet_topup_inr);
      if (back > 0) {
        await tx`insert into mkt.ad_wallet_ledger (vendor_id, delta_inr, reason, ref_id, note, created_by)
          values (${cur.vendor_id}, ${-back}, 'adjustment', ${cur.id}, 'Refund of a top-up', ${actor})`;
        took.wallet = back;
      }
    }
    if (cur.service_code) {
      const ended = await tx`update mkt.rm_engagements set status = 'rejected' where order_id = ${cur.id} and status in ('pending_payment','pending_approval') returning id`;
      if (ended.length) took.rm = 'withdrawn';
    }
    const [r] = await tx<{ id: string }[]>`
      insert into mkt.refunds (order_id, amount_inr, method, gateway_refund_id, reference, reason, took_back, created_by)
      values (${cur.id}, ${i.amount}, ${i.method}, ${gatewayId}, ${i.reference.trim()}, ${reason}, ${tx.json(took as never)}, ${actor})
      returning id`;
    await issueCreditNote(tx, r.id, actor);
    const total = cur.refunded_inr + i.amount;
    await tx`update mkt.orders set refunded_inr = ${total}, status = ${total >= cur.amount_inr ? 'refunded' : 'paid'} where id = ${cur.id}`;
    const [buyer] = await tx<{ email: string | null; name: string }[]>`select email, full_name as name from mkt.profiles where id = ${cur.profile_id}`;
    if (buyer?.email) await queueEmail(tx, buyer.email, 'refund_issued', { name: buyer.name || 'there', amount: i.amount.toLocaleString('en-IN'), order: cur.id.slice(0, 8).toUpperCase() }, `refund:${r.id}`);
    await audit(tx, actor, 'order.refund', 'order', cur.id, { amount: i.amount, method: i.method, took });
    return { id: r.id, took };
  });
}
