import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { grantCredits } from './leads';

export type Gateway = 'razorpay' | 'payu' | 'manual' | 'test';
export type Pack = {
  id: number;
  code: string;
  name: string;
  kind: 'plan' | 'topup';
  credits: number;
  price_inr: number;
  validity_days: number | null;
  category_ids: number[] | null;
  tier_codes: string[] | null;
  requires_contract: boolean;
  active: boolean;
  description: string;
};
export type Order = {
  id: string;
  vendor_id: string | null;
  profile_id: string;
  pack_id: number | null;
  amount_inr: number;
  gateway: Gateway;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  buyer_gstin: string | null;
  created_at: Date;
  paid_at: Date | null;
};

export async function gatewayStates(db: Db) {
  const rows = await db<{ gateway: Gateway; enabled: boolean }[]>`select gateway, enabled from mkt.gateway_settings`;
  const allowTest = process.env.NODE_ENV !== 'production';
  return rows
    .filter((r) => r.gateway !== 'test' || allowTest)
    .map((r) => ({ ...r, configured: isConfigured(r.gateway) }));
}

export function isConfigured(g: Gateway) {
  if (g === 'razorpay') return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  if (g === 'payu') return Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT);
  if (g === 'test') return process.env.NODE_ENV !== 'production';
  return true;
}

export async function setGateway(db: Db, gateway: Gateway, enabled: boolean, actor: string) {
  await db`update mkt.gateway_settings set enabled = ${enabled}, updated_at = now(), updated_by = ${actor} where gateway = ${gateway}`;
  await audit(db, actor, 'gateway.toggle', 'gateway', gateway, { enabled });
}

export async function packsFor(db: Db, categoryId: number) {
  return db<Pack[]>`
    select * from mkt.packs where active and (category_ids is null or ${categoryId} = any(category_ids))
    order by sort`;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export async function createOrder(
  db: Db,
  input: { profileId: string; vendorId: string; packId: number; gateway: Gateway; buyerGstin?: string | null }
) {
  const [gw] = await db<{ enabled: boolean }[]>`select enabled from mkt.gateway_settings where gateway = ${input.gateway}`;
  if (!gw?.enabled || !isConfigured(input.gateway)) {
    throw new DomainError('gateway_off', 'This payment method is temporarily unavailable');
  }
  const [pack] = await db<Pack[]>`select * from mkt.packs where id = ${input.packId} and active`;
  if (!pack) throw new DomainError('bad_pack', 'That pack is not available');
  const gstin = input.buyerGstin?.trim().toUpperCase() || null;
  if (gstin && !GSTIN_RE.test(gstin)) throw new DomainError('bad_gstin', 'That GSTIN does not look right');
  const [order] = await db<Order[]>`
    insert into mkt.orders (vendor_id, profile_id, pack_id, amount_inr, gateway, buyer_gstin)
    values (${input.vendorId}, ${input.profileId}, ${pack.id}, ${pack.price_inr}, ${input.gateway}, ${gstin})
    returning *`;
  return { order, pack };
}

/** Idempotent: a second call for the same order does nothing. */
export async function markOrderPaid(sql: Sql, orderId: string, paymentId: string | null, actor: string | null) {
  return sql.begin(async (tx) => {
    const [order] = await tx<Order[]>`select * from mkt.orders where id = ${orderId} for update`;
    if (!order) throw new DomainError('not_found', 'Order not found');
    if (order.status === 'paid') return { order, alreadyPaid: true };
    if (order.status !== 'created') throw new DomainError('bad_state', `Order is ${order.status}`);
    const [paid] = await tx<Order[]>`
      update mkt.orders set status = 'paid', paid_at = now(), gateway_payment_id = coalesce(${paymentId}, gateway_payment_id)
      where id = ${orderId} returning *`;
    const [pack] = await tx<Pack[]>`select * from mkt.packs where id = ${order.pack_id}`;
    if (pack && order.vendor_id) {
      if (pack.kind === 'topup') {
        await grantCredits(tx, order.vendor_id, 'topup', pack.credits, 'purchase', order.id, actor, pack.name);
      } else {
        const [sub] = await tx<{ id: string }[]>`
          insert into mkt.vendor_subscriptions (vendor_id, pack_id, order_id, status)
          values (${order.vendor_id}, ${pack.id}, ${order.id}, 'pending_contract') returning id`;
        if (!pack.requires_contract) await activate(tx, sub.id, null, null, actor);
      }
    }
    await audit(tx, actor, 'order.paid', 'order', orderId, { paymentId });
    return { order: paid, alreadyPaid: false };
  });
}

async function activate(db: Db, subId: string, invoiceUrl: string | null, contractUrl: string | null, actor: string | null) {
  const [sub] = await db<{ id: string; vendor_id: string; status: string; credits: number; validity_days: number | null; name: string }[]>`
    select s.id, s.vendor_id, s.status, p.credits, p.validity_days, p.name
    from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id where s.id = ${subId} for update of s`;
  if (!sub) throw new DomainError('not_found', 'Subscription not found');
  if (sub.status !== 'pending_contract') throw new DomainError('bad_state', 'This plan is not waiting for activation');
  await db`
    update mkt.vendor_subscriptions set status = 'active', invoice_url = ${invoiceUrl}, contract_url = ${contractUrl},
      starts_at = now(),
      ends_at = case when ${sub.validity_days}::int is null then null else now() + make_interval(days => ${sub.validity_days}) end,
      activated_by = ${actor}
    where id = ${subId}`;
  await grantCredits(db, sub.vendor_id, 'plan', sub.credits, 'purchase', sub.id, actor, sub.name);
}

/** Plans activate only after Ops uploads the invoice and the signed contract. */
export async function activateSubscription(sql: Sql, subId: string, invoiceUrl: string, contractUrl: string, actor: string) {
  if (!invoiceUrl.trim() || !contractUrl.trim()) {
    throw new DomainError('missing_docs', 'Upload both the invoice and the signed contract first');
  }
  return sql.begin(async (tx) => {
    await activate(tx, subId, invoiceUrl.trim(), contractUrl.trim(), actor);
    await audit(tx, actor, 'subscription.activate', 'subscription', subId);
  });
}

// ---------------------------------------------------------------- Razorpay
export async function razorpayCreateOrder(order: Order) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: order.amount_inr * 100, currency: 'INR', receipt: order.id, notes: { order_id: order.id } }),
  });
  if (!res.ok) throw new DomainError('gateway_error', 'Razorpay could not create the order');
  return (await res.json()) as { id: string };
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function razorpayCheckoutValid(gatewayOrderId: string, paymentId: string, signature: string) {
  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
    .update(`${gatewayOrderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

export function razorpayWebhookValid(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

// ---------------------------------------------------------------- PayU
export function payuRequestFields(order: Order, pack: Pack, buyer: { name: string; email: string; phone: string }, site: string) {
  const key = process.env.PAYU_KEY ?? '';
  const salt = process.env.PAYU_SALT ?? '';
  const amount = order.amount_inr.toFixed(2);
  const productinfo = `OLReady ${pack.name}`;
  const firstname = buyer.name.split(' ')[0] || 'Vendor';
  const hash = createHash('sha512')
    .update(`${key}|${order.id}|${amount}|${productinfo}|${firstname}|${buyer.email}|||||||||||${salt}`)
    .digest('hex');
  return {
    action: `${process.env.PAYU_BASE_URL ?? 'https://secure.payu.in'}/_payment`,
    fields: {
      key,
      txnid: order.id,
      amount,
      productinfo,
      firstname,
      email: buyer.email,
      phone: buyer.phone,
      surl: `${site}/api/payments/payu/callback`,
      furl: `${site}/api/payments/payu/callback`,
      hash,
    },
  };
}

export function payuResponseValid(p: Record<string, string>) {
  const salt = process.env.PAYU_SALT ?? '';
  const seq = [
    salt, p.status, '', '', '', '', '', p.udf5 ?? '', p.udf4 ?? '', p.udf3 ?? '', p.udf2 ?? '', p.udf1 ?? '',
    p.email, p.firstname, p.productinfo, p.amount, p.txnid, p.key,
  ].join('|');
  const expected = createHash('sha512').update(seq).digest('hex');
  return safeEqual(expected, (p.hash ?? '').toLowerCase());
}
