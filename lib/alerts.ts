import { getSetting, type Db } from './db';
import { formatInr } from './catalog';
import { queueEmail, type EmailTemplate } from './email';
import { queueWhatsApp, type WaEvent } from './whatsapp';
import { siteUrl } from './seo';
import { fmtDate } from './dates';

/**
 * News each side should hear without opening the site: by email always (unless they turned
 * emails off), and by WhatsApp as well once the template is approved and switched on.
 * Every send has a dedupe key, so a repeated click or a re-run job never sends twice.
 * Nothing here may break the action that triggered it.
 */

const first = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'there';
/** Runs inside a savepoint when called from a transaction, so a failed alert cannot undo the action. */
const quiet = async (db: Db, fn: (db: Db) => Promise<unknown>) => {
  try {
    const tx = db as unknown as { savepoint?: (f: (sp: Db) => Promise<unknown>) => Promise<unknown> };
    if (typeof tx.savepoint === 'function') await tx.savepoint((sp) => fn(sp));
    else await fn(db);
  } catch (e) {
    console.error('alert failed', e);
  }
};

type VendorContact = { id: string; business: string; email: string | null; phone: string | null; wa: boolean; mail: boolean };
async function vendorContact(db: Db, vendorId: string): Promise<VendorContact | null> {
  const [v] = await db<VendorContact[]>`
    select v.id, v.business_name as business, coalesce(p.email, v.email) as email, v.phone, v.whatsapp_alerts as wa,
      coalesce(p.notify_email, true) as mail
    from mkt.vendors v left join mkt.profiles p on p.id = v.owner_profile_id where v.id = ${vendorId}`;
  return v ?? null;
}

async function tellVendor(db: Db, v: VendorContact, email: EmailTemplate, payload: Record<string, unknown>, wa: WaEvent | null, waParams: string[], key: string, opts: { always?: boolean } = {}) {
  // Money and account news goes out even when marketing-style emails are off.
  if (v.email && (v.mail || opts.always)) await queueEmail(db, v.email, email, { business: v.business, ...payload }, key);
  if (wa && (v.wa || opts.always)) await queueWhatsApp(db, v.phone, wa, waParams, `wa:${key}`);
}

// ---------------------------------------------------------------- bride

/** "We have your request and will call you" the moment she sends it. */
export const alertRequestReceived = (db: Db, leadId: string) =>
  quiet(db, async (db) => {
    const [l] = await db<{ name: string; email: string | null; phone: string; opt_in: boolean; cats: string | null }[]>`
      select l.bride_name as name, coalesce(p.email, l.email) as email, l.phone, l.whatsapp_opt_in as opt_in,
        (select string_agg(lower(c.name), ', ' order by c.sort) from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id
          where ln.lead_id = l.id and ln.status <> 'removed') as cats
      from mkt.leads l left join mkt.profiles p on p.id = l.bride_profile_id where l.id = ${leadId}`;
    if (!l) return;
    const cats = l.cats ?? 'your wedding';
    if (l.email) await queueEmail(db, l.email, 'request_received', { name: first(l.name), cats }, `received:${leadId}`);
    if (l.opt_in) await queueWhatsApp(db, l.phone, 'request_received', [first(l.name), cats], `wa:received:${leadId}`);
  });

/** Both sides hear that the booking is on record. */
export const alertBooking = (db: Db, needId: string, vendorId: string) =>
  quiet(db, async (db) => {
    const [b] = await db<{ bride: string; email: string | null; phone: string; opt_in: boolean; category: string; date: string | null; mail: boolean }[]>`
      select l.bride_name as bride, coalesce(p.email, l.email) as email, l.phone, l.whatsapp_opt_in as opt_in, lower(c.name) as category,
        to_char(l.event_date, 'YYYY-MM-DD') as date, coalesce(p.notify_email, true) as mail
      from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
      left join mkt.profiles p on p.id = l.bride_profile_id where ln.id = ${needId}`;
    const v = await vendorContact(db, vendorId);
    if (!b || !v) return;
    const when = fmtDate(b.date, 'date to be confirmed');
    if (b.email && b.mail) await queueEmail(db, b.email, 'booking_confirmed', { name: first(b.bride), vendor: v.business, category: b.category }, `booked:${needId}`);
    if (b.opt_in) await queueWhatsApp(db, b.phone, 'booking_recorded_bride', [first(b.bride), v.business, b.category], `wa:booked:${needId}`);
    await tellVendor(db, v, 'booking_recorded_vendor', { bride: first(b.bride), category: b.category, when }, 'booking_recorded_vendor', [v.business, first(b.bride), when], `booked:${needId}:v`);
  });

// ---------------------------------------------------------------- vendor

/** The profile went live, or was sent back for changes. */
export const alertVendorStatus = (db: Db, vendorId: string, was: string | null, now: string | null) =>
  quiet(db, async (db) => {
    if (!now || was === now) return;
    const v = await vendorContact(db, vendorId);
    if (!v) return;
    const day = new Date().toISOString().slice(0, 10);
    if (now === 'live') {
      const [s] = await db<{ slug: string }[]>`select slug from mkt.vendors where id = ${vendorId}`;
      await tellVendor(db, v, 'vendor_profile_live', { link: `${siteUrl()}/v/${s.slug}` }, 'vendor_profile_live', [v.business, `${siteUrl()}/v/${s.slug}`], `live:${vendorId}:${day}`, { always: true });
    } else if (was === 'pending_review' && now === 'draft') {
      await tellVendor(db, v, 'vendor_profile_back', {}, null, [], `back:${vendorId}:${day}`, { always: true });
    } else if (now === 'suspended') {
      await tellVendor(db, v, 'vendor_profile_paused', {}, null, [], `paused:${vendorId}:${day}`, { always: true });
    }
  });

export const alertClaimDecided = (db: Db, claimId: string, approved: boolean) =>
  quiet(db, async (db) => {
    const [c] = await db<{ email: string | null; business: string }[]>`
      select coalesce(p.email, c.invite_email) as email, v.business_name as business
      from mkt.vendor_claims c join mkt.vendors v on v.id = c.vendor_id left join mkt.profiles p on p.id = c.profile_id where c.id = ${claimId}`;
    if (c?.email) await queueEmail(db, c.email, approved ? 'claim_approved' : 'claim_rejected', { business: c.business }, `claim:${claimId}`);
  });

/** Payment in: what was bought, the amount, the tax invoice, and what happens next. */
export const alertOrderPaid = (db: Db, orderId: string) =>
  quiet(db, async (db) => {
    const [o] = await db<{
      amount: number; vendor_id: string | null; email: string | null; name: string | null; pack: string | null; kind: string | null; credits: number | null;
      wallet: number | null; service: string | null; needs_contract: boolean | null; invoice_id: string | null; invoice_no: string | null;
    }[]>`
      select o.amount_inr as amount, o.vendor_id, p.email, p.full_name as name, pk.name as pack, pk.kind, pk.credits, o.wallet_topup_inr as wallet,
        s.name as service, pk.requires_contract as needs_contract, d.id as invoice_id, d.number as invoice_no
      from mkt.orders o join mkt.profiles p on p.id = o.profile_id
      left join mkt.packs pk on pk.id = o.pack_id left join mkt.services s on s.code = o.service_code
      left join mkt.tax_documents d on d.order_id = o.id and d.kind = 'invoice'
      where o.id = ${orderId} and o.status = 'paid'`;
    if (!o) return;
    const what = o.pack ?? (o.wallet ? `Ads wallet top-up` : (o.service ?? 'OLReady service'));
    const next = o.kind === 'plan'
      ? o.needs_contract
        ? 'Your plan starts as soon as the signed contract is with us. We will tell you the moment it is active.'
        : 'Your plan is active and the enquiries are in your account.'
      : o.kind === 'topup'
        ? `${o.credits} enquiries are in your account now.`
        : o.wallet
          ? 'The amount is in your ads wallet.'
          : 'Our team will confirm and assign your relationship manager shortly.';
    const invoice = o.invoice_id ? `${siteUrl()}/invoices/${o.invoice_id}` : `${siteUrl()}/receipt/${orderId}`;
    const payload = { what, amount: formatInr(o.amount), next, invoice, invoiceNo: o.invoice_no ?? '' };
    if (o.vendor_id) {
      const v = await vendorContact(db, o.vendor_id);
      if (v) await tellVendor(db, v, 'payment_received', payload, 'payment_received', [v.business, formatInr(o.amount), what, invoice], `paid:${orderId}`, { always: true });
    } else if (o.email) {
      await queueEmail(db, o.email, 'payment_received', { business: first(o.name), ...payload }, `paid:${orderId}`);
    }
  });

export const alertPlanStarted = (db: Db, subId: string) =>
  quiet(db, async (db) => {
    const [s] = await db<{ vendor_id: string; plan: string; credits: number; ends: string | null }[]>`
      select s.vendor_id, p.name as plan, p.credits, to_char(s.ends_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as ends
      from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id where s.id = ${subId} and s.status = 'active'`;
    if (!s) return;
    const v = await vendorContact(db, s.vendor_id);
    if (!v) return;
    const until = fmtDate(s.ends, 'no end date');
    await tellVendor(db, v, 'plan_started', { plan: s.plan, credits: s.credits, until }, 'plan_started', [v.business, s.plan, String(s.credits), until], `plan:${subId}`, { always: true });
  });

/** After an unlock: a heads-up when few enquiries are left, once a week at most. */
export const alertCreditsLow = (db: Db, vendorId: string) =>
  quiet(db, async (db) => {
    const threshold = await getSetting(db, 'low_credit_threshold', 3);
    const [{ left }] = await db<{ left: number }[]>`select coalesce(sum(delta), 0)::int as left from mkt.credit_ledger where vendor_id = ${vendorId}`;
    if (left > threshold) return;
    const v = await vendorContact(db, vendorId);
    if (!v) return;
    const week = Math.floor(Date.now() / (7 * 864e5));
    await tellVendor(db, v, 'credits_low', { left }, 'credits_low', [v.business, String(left), `${siteUrl()}/vendor/packs`], `low:${vendorId}:${week}`);
  });

export const alertReview = (db: Db, reviewId: string) =>
  quiet(db, async (db) => {
    const [r] = await db<{ vendor_id: string; stars: number; by: string | null }[]>`
      select r.vendor_id, round((r.rating_artist + r.rating_service) / 2.0, 1)::float as stars, p.full_name as by
      from mkt.reviews r left join mkt.profiles p on p.id = r.author_profile_id where r.id = ${reviewId}`;
    if (!r) return;
    const v = await vendorContact(db, r.vendor_id);
    if (v) await tellVendor(db, v, 'review_received', { by: first(r.by), stars: r.stars }, 'review_received', [v.business, first(r.by), String(r.stars), `${siteUrl()}/vendor/reviews`], `review:${reviewId}`);
  });

export const alertDispute = (db: Db, disputeId: string, stage: 'contacted' | 'upheld' | 'rejected' | 'expired') =>
  quiet(db, async (db) => {
    const [d] = await db<{ vendor_id: string; proof_due: string | null }[]>`
      select vendor_id, to_char(proof_due_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as proof_due from mkt.review_disputes where id = ${disputeId}`;
    if (!d) return;
    const v = await vendorContact(db, d.vendor_id);
    if (v) await tellVendor(db, v, 'dispute_update', { stage, due: fmtDate(d.proof_due, '') }, null, [], `dispute:${disputeId}:${stage}`, { always: true });
  });

// ---------------------------------------------------------------- plan usage

export type PlanPace = {
  sub_id: string; vendor_id: string; business: string; phone: string | null; plan: string; credits: number; used: number;
  days_left: number; days_total: number; open_leads: number; last_unlock: string | null; expected: number;
};

/**
 * Active plans that are behind: the share of enquiries used trails the share of time gone by more
 * than the set gap. A plan a third of the way in with almost nothing used is the vendor we want to call.
 */
export async function plansBehind(db: Db): Promise<PlanPace[]> {
  const gap = await getSetting(db, 'plan_nudge_gap_pct', 25);
  return db<PlanPace[]>`
    with s as (
      select s.id as sub_id, s.vendor_id, v.business_name as business, v.phone, p.name as plan, p.credits,
        greatest(0, p.credits - greatest(0, (select coalesce(sum(delta), 0) from mkt.credit_ledger cl where cl.vendor_id = s.vendor_id and cl.credit_kind = 'plan')))::int as used,
        greatest(0, ceil(extract(epoch from (s.ends_at - now())) / 86400))::int as days_left,
        greatest(1, round(extract(epoch from (s.ends_at - s.starts_at)) / 86400))::int as days_total,
        (select count(*) from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id
          where ln.category_id = v.category_id and ln.status = 'open' and l.status = 'verified'
            and (ln.direct_vendor_id is null or ln.direct_vendor_id = v.id)
            and mkt.need_city_ids(ln.id) && (v.city_id || v.service_city_ids)
            and not exists (select 1 from mkt.unlocks u where u.lead_need_id = ln.id and u.vendor_id = v.id))::int as open_leads,
        (select to_char(max(u.created_at) at time zone 'Asia/Kolkata', 'YYYY-MM-DD') from mkt.unlocks u where u.vendor_id = v.id) as last_unlock
      from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id join mkt.vendors v on v.id = s.vendor_id
      where s.status = 'active' and s.ends_at is not null and s.ends_at > now() and s.starts_at is not null and p.credits > 0
    )
    select *, round(credits * (days_total - days_left)::numeric / days_total)::int as expected from s
    where (days_total - days_left)::numeric / days_total >= 0.2
      and used::numeric / credits * 100 < (days_total - days_left)::numeric / days_total * 100 - ${gap}
    order by (credits * (days_total - days_left)::numeric / days_total - used) desc limit 200`;
}

/** Daily: ask vendors who are behind on their plan to look at the open requests, at most once per set period. */
export async function queuePlanNudges(db: Db) {
  const every = Math.max(1, await getSetting(db, 'plan_nudge_every_days', 14));
  const period = Math.floor(Date.now() / (every * 864e5));
  const rows = await plansBehind(db);
  for (const r of rows) {
    const v = await vendorContact(db, r.vendor_id);
    if (!v) continue;
    await tellVendor(
      db, v, 'plan_usage_low',
      { plan: r.plan, used: r.used, credits: r.credits, daysLeft: r.days_left, openLeads: r.open_leads },
      'plan_usage_low', [v.business, String(r.used), String(r.credits), String(r.days_left), `${siteUrl()}/vendor`],
      `pace:${r.sub_id}:${period}`
    );
  }
  return rows.length;
}

// ---------------------------------------------------------------- staff

export type StaffAlertKind = 'lead' | 'transfer' | 'profile' | 'claim' | 'dispute' | 'rm' | 'contract';
const STAFF_TEXT: Record<StaffAlertKind, string> = {
  lead: 'New request to verify',
  transfer: 'Bank transfer to confirm',
  profile: 'Vendor profile to review',
  claim: 'Profile claim to approve',
  dispute: 'Review dispute opened',
  rm: 'Relationship-manager request paid',
  contract: 'Plan paid, waiting for contract',
};

/** The next moment outside quiet hours (India time), or now. */
export function afterQuietHours(now: Date, from: number, to: number) {
  if (from === to) return now;
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  const h = ist.getUTCHours();
  const inQuiet = from > to ? h >= from || h < to : h >= from && h < to;
  if (!inQuiet) return now;
  const wake = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), to, 0, 0));
  if (wake.getTime() <= ist.getTime()) wake.setUTCDate(wake.getUTCDate() + 1);
  return new Date(wake.getTime() - 5.5 * 3600e3);
}

/** Tells the team something is waiting. Recipients: STAFF_ALERT_EMAILS and STAFF_ALERT_PHONES. Held back during quiet hours. */
export const staffAlert = (db: Db, kind: StaffAlertKind, detail: string, path: string, key: string) =>
  quiet(db, async (db) => {
    if (!(await getSetting(db, 'staff_alerts_on', 1))) return;
    const emails = (process.env.STAFF_ALERT_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const phones = (process.env.STAFF_ALERT_PHONES ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    if (!emails.length && !phones.length) return;
    const when = afterQuietHours(new Date(), await getSetting(db, 'staff_quiet_from_hour', 21), await getSetting(db, 'staff_quiet_to_hour', 9));
    const link = `${siteUrl()}${path}`;
    for (const to of emails) {
      await queueEmail(db, to, 'staff_alert', { what: STAFF_TEXT[kind], detail, link }, `staff:${key}:${to}`);
      await db`update mkt.email_outbox set send_after = ${when} where dedupe_key = ${`staff:${key}:${to}`} and sent_at is null`;
    }
    for (const ph of phones) {
      const queued = await queueWhatsApp(db, ph, 'staff_alert', [STAFF_TEXT[kind], detail, link], `wa:staff:${key}:${ph.slice(-4)}`);
      if (queued) await db`update mkt.whatsapp_outbox set send_after = ${when} where dedupe_key = ${`wa:staff:${key}:${ph.slice(-4)}`}`;
    }
  });
