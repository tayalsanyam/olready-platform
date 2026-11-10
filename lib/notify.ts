import type { Db } from './db';
import { formatInr } from './catalog';
import { queueEmail } from './email';
import { queueWhatsApp } from './whatsapp';
import { siteUrl } from './seo';

/**
 * Event emails. Each is queued in the outbox with a dedupe key, so retries and repeated
 * clicks never send twice; the daily job (or the next flush) sends them through Resend.
 */

const hourKey = () => new Date().toISOString().slice(0, 13);
// WhatsApp is noisier than email: at most one message per conversation per six hours.
const sixHourKey = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)}-${Math.floor(d.getUTCHours() / 6)}`;
};
const firstName = (n: string) => n.trim().split(/\s+/)[0] || 'there';

export async function notifyNewLead(db: Db, leadId: string) {
  const rows = await db<{ need_id: string; vendor_id: string; email: string; business: string; category: string; city: string; date: string | null }[]>`
    select ln.id as need_id, v.id as vendor_id, coalesce(p.email, v.email) as email, v.business_name as business,
      c.name as category, ci.name as city, to_char(l.event_date, 'DD Mon YYYY') as date
    from mkt.lead_needs ln
    join mkt.leads l on l.id = ln.lead_id
    join mkt.categories c on c.id = ln.category_id
    join mkt.cities ci on ci.id = l.city_id
    join mkt.vendors v on v.category_id = ln.category_id and v.status = 'live'
      and mkt.need_city_ids(ln.id) && (v.city_id || v.service_city_ids)
      and (ln.direct_vendor_id is null or ln.direct_vendor_id = v.id)
    left join mkt.profiles p on p.id = v.owner_profile_id
    where l.id = ${leadId} and l.status = 'verified' and ln.status = 'open'
      and coalesce(p.email, v.email) is not null and coalesce(p.notify_email, true)
      -- Not vendors already booked on every dated function this category is needed for.
      and not coalesce((select bool_and(mkt.vendor_busy(v.id, e.event_date)) from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
        where ne.need_id = ln.id and e.event_date is not null), false)`;
  for (const r of rows) {
    await queueEmail(db, r.email, 'vendor_new_lead', { business: r.business, category: r.category.toLowerCase(), city: r.city, date: r.date ?? '' }, `newlead:${r.need_id}:${r.vendor_id}`);
  }
  await whatsappNewLead(db, leadId);
  return rows.length;
}

/** WhatsApp for a newly verified request: the bride if she opted in, vendors who turned alerts on. */
async function whatsappNewLead(db: Db, leadId: string) {
  const [l] = await db<{ phone: string; name: string; opt_in: boolean; cats: string }[]>`
    select l.phone, l.bride_name as name, l.whatsapp_opt_in as opt_in,
      (select string_agg(lower(c.name), ', ' order by c.sort) from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id
       where ln.lead_id = l.id and ln.status <> 'removed') as cats
    from mkt.leads l where l.id = ${leadId} and l.status = 'verified'`;
  if (!l) return;
  if (l.opt_in) await queueWhatsApp(db, l.phone, 'request_verified', [firstName(l.name), l.cats ?? 'your wedding'], `wa:verified:${leadId}`);
  const vendors = await db<{ need_id: string; vendor_id: string; phone: string | null; business: string; category: string; city: string; date: string | null }[]>`
    select ln.id as need_id, v.id as vendor_id, v.phone, v.business_name as business, lower(c.name) as category, ci.name as city,
      coalesce(to_char(l.event_date, 'DD Mon YYYY'), 'a date to be confirmed') as date
    from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id
    join mkt.categories c on c.id = ln.category_id join mkt.cities ci on ci.id = l.city_id
    join mkt.vendors v on v.category_id = ln.category_id and v.status = 'live' and v.whatsapp_alerts
      and mkt.need_city_ids(ln.id) && (v.city_id || v.service_city_ids)
      and (ln.direct_vendor_id is null or ln.direct_vendor_id = v.id)
    where l.id = ${leadId} and ln.status = 'open'
      -- Not vendors already booked on every dated function this category is needed for.
      and not coalesce((select bool_and(mkt.vendor_busy(v.id, e.event_date)) from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
        where ne.need_id = ln.id and e.event_date is not null), false)`;
  for (const v of vendors)
    await queueWhatsApp(db, v.phone, 'vendor_new_lead', [v.business, v.category, v.city, v.date ?? '', `${siteUrl()}/vendor`], `wa:newlead:${v.need_id}:${v.vendor_id}`);
}

/** Tells the other side of a conversation; at most one email per recipient per thread per hour. */
export async function notifyMessage(db: Db, threadId: string, senderId: string, body: string) {
  const [t] = await db<{ vendor_owner: string | null; vendor_email: string | null; business: string; bride_id: string | null; bride_email: string | null; bride_name: string }[]>`
    select v.owner_profile_id as vendor_owner, case when coalesce(vp.notify_email, true) then coalesce(vp.email, v.email) end as vendor_email, v.business_name as business,
      l.bride_profile_id as bride_id, case when coalesce(bp.notify_email, true) then coalesce(bp.email, l.email) end as bride_email, l.bride_name
    from mkt.threads t join mkt.vendors v on v.id = t.vendor_id
    join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id
    left join mkt.profiles vp on vp.id = v.owner_profile_id left join mkt.profiles bp on bp.id = l.bride_profile_id
    where t.id = ${threadId}`;
  if (!t) return;
  const preview = body.length > 140 ? body.slice(0, 137) + '…' : body;
  if (senderId === t.vendor_owner) {
    if (t.bride_email) {
      await queueEmail(db, t.bride_email, 'new_message', { name: t.bride_name.split(' ')[0], from: t.business, preview, path: `/me/threads/${threadId}` }, `msg:${threadId}:bride:${hourKey()}`);
    }
  } else if (t.vendor_email) {
    await queueEmail(db, t.vendor_email, 'new_message', { name: t.business, from: t.bride_name.split(' ')[0], preview, path: `/vendor/threads/${threadId}` }, `msg:${threadId}:vendor:${hourKey()}`);
  }
  const [w] = await db<{ bride_phone: string; opt_in: boolean; vendor_phone: string | null; alerts: boolean }[]>`
    select l.phone as bride_phone, l.whatsapp_opt_in as opt_in, v.phone as vendor_phone, v.whatsapp_alerts as alerts
    from mkt.threads t join mkt.vendors v on v.id = t.vendor_id join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id
    where t.id = ${threadId}`;
  if (!w) return;
  if (senderId === t.vendor_owner) {
    if (w.opt_in) await queueWhatsApp(db, w.bride_phone, 'bride_message', [firstName(t.bride_name), t.business, `${siteUrl()}/me/threads/${threadId}`], `wa:msg:${threadId}:bride:${sixHourKey()}`);
  } else if (w.alerts) {
    await queueWhatsApp(db, w.vendor_phone, 'vendor_message', [t.business, firstName(t.bride_name), `${siteUrl()}/vendor/threads/${threadId}`], `wa:msg:${threadId}:vendor:${sixHourKey()}`);
  }
}

export async function notifyQuote(db: Db, quoteId: string, event: 'sent' | 'accepted') {
  const [q] = await db<{ thread_id: string; amount_inr: number; business: string; vendor_email: string | null; bride_email: string | null; bride_name: string; category: string }[]>`
    select q.thread_id, q.amount_inr, v.business_name as business,
      case when coalesce(vp.notify_email, true) then coalesce(vp.email, v.email) end as vendor_email,
      case when coalesce(bp.notify_email, true) then coalesce(bp.email, l.email) end as bride_email, l.bride_name, c.name as category
    from mkt.quotes q join mkt.threads t on t.id = q.thread_id join mkt.vendors v on v.id = t.vendor_id
    join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
    left join mkt.profiles vp on vp.id = v.owner_profile_id left join mkt.profiles bp on bp.id = l.bride_profile_id
    where q.id = ${quoteId}`;
  if (!q) return;
  if (event === 'sent' && q.bride_email) {
    await queueEmail(db, q.bride_email, 'quote_received', { name: q.bride_name.split(' ')[0], vendor: q.business, amount: formatInr(q.amount_inr), category: q.category.toLowerCase(), path: `/me/threads/${q.thread_id}` }, `quote:${quoteId}`);
  }
  if (event === 'accepted' && q.vendor_email) {
    await queueEmail(db, q.vendor_email, 'quote_accepted', { business: q.business, bride: q.bride_name.split(' ')[0], amount: formatInr(q.amount_inr), path: `/vendor/threads/${q.thread_id}` }, `accepted:${quoteId}`);
  }
  const [w] = await db<{ bride_phone: string; opt_in: boolean; vendor_phone: string | null; alerts: boolean }[]>`
    select l.phone as bride_phone, l.whatsapp_opt_in as opt_in, v.phone as vendor_phone, v.whatsapp_alerts as alerts
    from mkt.quotes q join mkt.threads t on t.id = q.thread_id join mkt.vendors v on v.id = t.vendor_id
    join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id where q.id = ${quoteId}`;
  if (!w) return;
  if (event === 'sent' && w.opt_in)
    await queueWhatsApp(db, w.bride_phone, 'quote_received', [firstName(q.bride_name), q.business, formatInr(q.amount_inr), `${siteUrl()}/me/compare`], `wa:quote:${quoteId}`);
  if (event === 'accepted' && w.alerts)
    await queueWhatsApp(db, w.vendor_phone, 'quote_accepted', [q.business, firstName(q.bride_name), formatInr(q.amount_inr), `${siteUrl()}/vendor/threads/${q.thread_id}`], `wa:accepted:${quoteId}`);
}

export async function notifyRmAssigned(db: Db, engagementId: string) {
  const [e] = await db<{ email: string | null; name: string; rm: string }[]>`
    select p.email, p.full_name as name, r.full_name as rm from mkt.rm_engagements e
    join mkt.profiles p on p.id = e.profile_id join mkt.profiles r on r.id = e.rm_profile_id where e.id = ${engagementId}`;
  if (e?.email) await queueEmail(db, e.email, 'rm_assigned', { name: e.name.split(' ')[0] || 'there', rm: e.rm }, `rm:${engagementId}`);
}
