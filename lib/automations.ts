import type { Db } from './db';
import { queueEmail } from './email';

const fmtTime = (d: Date) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d);

/**
 * The evening before each function: the couple get the day's plan and their booked vendors'
 * numbers; each booked vendor gets the bride's name, number, times and venues.
 */
export async function queueEventEve(db: Db) {
  const rows = await db<{ wedding_id: string; owner_email: string | null; owner_name: string; owner_notify: boolean; events: { name: string; starts_at: string; venue: string }[] }[]>`
    select w.id as wedding_id, p.email as owner_email, p.full_name as owner_name, coalesce(p.notify_email, true) as owner_notify,
           json_agg(json_build_object('name', e.name, 'starts_at', e.starts_at, 'venue', e.venue) order by e.starts_at) as events
    from mkt.wedding_events e
    join mkt.weddings w on w.id = e.wedding_id
    join mkt.profiles p on p.id = w.owner_profile_id
    where e.starts_at is not null
      and (e.starts_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date + 1
    group by w.id, p.email, p.full_name, p.notify_email`;
  let queued = 0;
  for (const r of rows) {
    const vendors = await db<{ vendor_name: string; vendor_phone: string | null; vendor_email: string | null; vendor_notify: boolean; category: string; bride_name: string; bride_phone: string }[]>`
      select distinct v.business_name as vendor_name, v.phone as vendor_phone, coalesce(vp.email, v.email) as vendor_email,
             coalesce(vp.notify_email, true) as vendor_notify, c.name as category, l.bride_name, l.phone as bride_phone
      from mkt.lead_needs ln
      join mkt.leads l on l.id = ln.lead_id
      join mkt.vendors v on v.id = ln.booked_vendor_id
      join mkt.categories c on c.id = ln.category_id
      left join mkt.profiles vp on vp.id = v.owner_profile_id
      where ln.status = 'closed_booked' and (l.wedding_id = ${r.wedding_id} or l.bride_profile_id = (select owner_profile_id from mkt.weddings where id = ${r.wedding_id}))`;
    const names = r.events.map((e) => e.name).join(' and ');
    const details = r.events.map((e) => `${e.name}: ${fmtTime(new Date(e.starts_at))}${e.venue ? `, ${e.venue}` : ''}`).join('\n');
    const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    if (r.owner_email && r.owner_notify) {
      await queueEmail(
        db,
        r.owner_email,
        'event_eve_bride',
        {
          name: (r.owner_name || 'there').split(' ')[0],
          events: names,
          details,
          vendors: vendors.length ? vendors.map((v) => `${v.category}: ${v.vendor_name}${v.vendor_phone ? `, ${v.vendor_phone}` : ''}`).join('\n') : 'None booked through OLReady yet.',
        },
        `eve:${r.wedding_id}:${day}`
      );
      queued++;
    }
    for (const v of vendors) {
      if (!v.vendor_email || !v.vendor_notify) continue;
      await queueEmail(
        db,
        v.vendor_email,
        'event_eve_vendor',
        { name: v.vendor_name, bride: v.bride_name.split(' ')[0], events: names, details, phone: v.bride_phone },
        `eve:${r.wedding_id}:${day}:${v.vendor_name}`
      );
      queued++;
    }
  }
  return queued;
}

/**
 * Check-ins with brides who are still choosing: a week after verification (how are the quotes?)
 * and at 15 days if nothing is booked and she has gone quiet (still looking?).
 */
export async function queueBrideCheckins(db: Db) {
  const week = await db<{ lead_id: string; email: string; name: string }[]>`
    select l.id as lead_id, coalesce(p.email, l.email) as email, l.bride_name as name
    from mkt.leads l left join mkt.profiles p on p.id = l.bride_profile_id
    where l.status = 'verified' and (l.verified_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date - 7
      and coalesce(p.email, l.email) is not null and coalesce(p.notify_email, true)
      and exists (select 1 from mkt.lead_needs ln where ln.lead_id = l.id and ln.status in ('open','capped'))`;
  for (const r of week) await queueEmail(db, r.email, 'checkin_7', { name: r.name.split(' ')[0] }, `checkin7:${r.lead_id}`);
  const quiet = await db<{ lead_id: string; email: string; name: string }[]>`
    select l.id as lead_id, coalesce(p.email, l.email) as email, l.bride_name as name
    from mkt.leads l left join mkt.profiles p on p.id = l.bride_profile_id
    where l.status = 'verified' and (l.verified_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date - 15
      and coalesce(p.email, l.email) is not null and coalesce(p.notify_email, true)
      and not exists (select 1 from mkt.lead_needs ln where ln.lead_id = l.id and ln.status = 'closed_booked')
      and not exists (
        select 1 from mkt.messages m join mkt.threads t on t.id = m.thread_id join mkt.lead_needs ln on ln.id = t.lead_need_id
        where ln.lead_id = l.id and m.sender_profile_id = l.bride_profile_id and m.created_at > now() - interval '7 days')`;
  for (const r of quiet) await queueEmail(db, r.email, 'still_looking_15', { name: r.name.split(' ')[0] }, `still15:${r.lead_id}`);
  return { week: week.length, quiet: quiet.length };
}
