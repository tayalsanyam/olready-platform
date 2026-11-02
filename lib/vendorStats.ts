import type { Db } from './db';

/**
 * Cost per booking: the number we sell against yearly listing fees.
 * Rupees per credit comes from what the vendor actually paid for credits.
 */
export async function vendorStats(db: Db, vendorId: string) {
  const [r] = await db<{
    unlocks: number;
    credits_spent: number;
    bookings: number;
    paid_inr: number;
    credits_bought: number;
    open_threads: number;
  }[]>`
    select
      (select count(*) from mkt.unlocks where vendor_id = ${vendorId} and not refunded)::int as unlocks,
      (select coalesce(sum(credits_spent), 0) from mkt.unlocks where vendor_id = ${vendorId} and not refunded)::int as credits_spent,
      (select count(*) from mkt.lead_needs where booked_vendor_id = ${vendorId} and status = 'closed_booked')::int as bookings,
      (select coalesce(sum(o.amount_inr), 0) from mkt.orders o where o.vendor_id = ${vendorId} and o.status = 'paid')::int as paid_inr,
      (select coalesce(sum(delta), 0) from mkt.credit_ledger where vendor_id = ${vendorId} and reason = 'purchase')::int as credits_bought,
      (select count(*) from mkt.threads where vendor_id = ${vendorId} and status in ('open','quoted','quote_accepted'))::int as open_threads`;
  const inrPerCredit = r.credits_bought > 0 ? r.paid_inr / r.credits_bought : null;
  const costPerBooking = inrPerCredit != null && r.bookings > 0 ? Math.round((r.credits_spent * inrPerCredit) / r.bookings) : null;
  const conversion = r.unlocks > 0 ? Math.round((100 * r.bookings) / r.unlocks) : null;
  return { ...r, inrPerCredit, costPerBooking, conversion };
}
