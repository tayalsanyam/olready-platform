import type { Db } from './db';
import { DomainError, audit } from './db';

export type Coupon = {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  max_discount_inr: number | null;
  min_amount_inr: number;
  applies_to: string[];
  starts_at: Date;
  ends_at: Date | null;
  max_uses: number | null;
  per_buyer: number;
  active: boolean;
  note: string;
};

/**
 * Works out the discount for a code on a purchase. product is a pack code, 'wallet' or the
 * service code. Uses count paid orders only, so abandoned checkouts do not burn a code.
 * The price never drops below ₹1, so every order still goes through a payment.
 */
export async function couponDiscount(db: Db, rawCode: string, o: { product: string; amount: number; profileId: string }) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { code: null, discount: 0 };
  const [c] = await db<Coupon[]>`select * from mkt.coupons where code = ${code}`;
  const now = new Date();
  if (!c || !c.active || c.starts_at > now || (c.ends_at && c.ends_at <= now)) throw new DomainError('coupon', 'That code is not valid');
  if (c.applies_to.length && !c.applies_to.includes(o.product)) throw new DomainError('coupon', 'That code does not apply to this purchase');
  if (o.amount < c.min_amount_inr) throw new DomainError('coupon', `That code needs a purchase of at least ₹${c.min_amount_inr.toLocaleString('en-IN')}`);
  const [{ used, mine }] = await db<{ used: number; mine: number }[]>`
    select count(*)::int as used, count(*) filter (where profile_id = ${o.profileId})::int as mine
    from mkt.orders where coupon_code = ${code} and status = 'paid'`;
  if (c.max_uses != null && used >= c.max_uses) throw new DomainError('coupon', 'That code has been used up');
  if (mine >= c.per_buyer) throw new DomainError('coupon', 'You have already used that code');
  let d = c.kind === 'percent' ? Math.floor((o.amount * c.value) / 100) : c.value;
  if (c.max_discount_inr != null) d = Math.min(d, c.max_discount_inr);
  d = Math.max(0, Math.min(d, o.amount - 1));
  return { code, discount: d };
}

export async function allCoupons(db: Db) {
  return db<(Coupon & { used: number; discount_given: number })[]>`
    select c.*, (select count(*) from mkt.orders o where o.coupon_code = c.code and o.status = 'paid')::int as used,
           (select coalesce(sum(o.discount_inr), 0) from mkt.orders o where o.coupon_code = c.code and o.status = 'paid')::int as discount_given
    from mkt.coupons c order by c.active desc, c.created_at desc`;
}

export async function createCoupon(
  db: Db,
  i: { code: string; kind: 'percent' | 'fixed'; value: number; maxDiscount: number | null; minAmount: number; appliesTo: string[]; endsAt: string | null; maxUses: number | null; perBuyer: number; note: string },
  actor: string
) {
  const code = i.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new DomainError('code', 'Codes are 3 to 24 letters, numbers or dashes');
  if (!Number.isInteger(i.value) || i.value <= 0 || (i.kind === 'percent' && i.value > 100)) throw new DomainError('value', 'Enter a valid discount');
  const [c] = await db<{ id: string }[]>`
    insert into mkt.coupons (code, kind, value, max_discount_inr, min_amount_inr, applies_to, ends_at, max_uses, per_buyer, note, created_by)
    values (${code}, ${i.kind}, ${i.value}, ${i.maxDiscount}, ${i.minAmount}, ${i.appliesTo}, ${i.endsAt ? `${i.endsAt}T23:59:59+05:30` : null},
      ${i.maxUses}, ${Math.max(1, i.perBuyer)}, ${i.note.trim()}, ${actor})
    on conflict (code) do nothing returning id`;
  if (!c) throw new DomainError('exists', 'That code already exists');
  await audit(db, actor, 'coupon.create', 'coupon', c.id, { code });
}

export async function setCouponActive(db: Db, id: string, active: boolean, actor: string) {
  await db`update mkt.coupons set active = ${active} where id = ${id}`;
  await audit(db, actor, active ? 'coupon.on' : 'coupon.off', 'coupon', id);
}
