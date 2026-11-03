import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { createEnquiry } from './leads';

export type Wedding = {
  id: string;
  owner_profile_id: string;
  title: string;
  partner_name: string;
  wedding_date: string | null;
  city_id: number | null;
  join_code: string;
  created_at: Date;
};

const weddingCols = (db: Db) =>
  db`w.id, w.owner_profile_id, w.title, w.partner_name, to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date,
     w.city_id, w.join_code, w.created_at`;

export async function weddingFor(db: Db, profileId: string) {
  const [w] = await db<(Wedding & { member_role: string })[]>`
    select ${weddingCols(db)}, m.role as member_role
    from mkt.weddings w join mkt.wedding_members m on m.wedding_id = w.id
    where m.profile_id = ${profileId}
    order by (m.role = 'owner') desc, w.created_at limit 1`;
  return w ?? null;
}

export async function assertMember(db: Db, weddingId: string, profileId: string) {
  const [m] = await db<{ role: string }[]>`
    select role from mkt.wedding_members where wedding_id = ${weddingId} and profile_id = ${profileId}`;
  if (!m) throw new DomainError('forbidden', 'You are not part of this wedding');
  return m.role;
}

/** Creates the bride's workspace and fills the checklist from templates, dated back from the wedding. */
export async function createWedding(
  sql: Sql,
  profileId: string,
  input: { title?: string; partnerName?: string; weddingDate?: string | null; cityId?: number | null }
) {
  return sql.begin(async (tx) => {
    const [w] = await tx<{ id: string }[]>`
      insert into mkt.weddings (owner_profile_id, title, partner_name, wedding_date, city_id)
      values (${profileId}, ${input.title?.trim() || 'Our wedding'}, ${input.partnerName?.trim() ?? ''},
        ${input.weddingDate || null}, ${input.cityId ?? null})
      returning id`;
    await tx`insert into mkt.wedding_members (wedding_id, profile_id, role) values (${w.id}, ${profileId}, 'owner')`;
    await tx`
      insert into mkt.checklist_items (wedding_id, title, due_date, category_id, sort)
      select ${w.id}, t.title,
        case when ${input.weddingDate || null}::date is null then null
             else (${input.weddingDate || null}::date - make_interval(months => t.months_before))::date end,
        t.category_id, t.sort
      from mkt.checklist_templates t order by t.sort`;
    await tx`
      insert into mkt.wedding_events (wedding_id, name, sort)
      values (${w.id}, 'Mehendi', 1), (${w.id}, 'Sangeet', 2), (${w.id}, 'Wedding', 3)`;
    return w;
  });
}

export async function updateWedding(
  db: Db,
  weddingId: string,
  profileId: string,
  input: { title: string; partnerName: string; weddingDate: string | null; cityId: number | null }
) {
  await assertMember(db, weddingId, profileId);
  await db`
    update mkt.weddings set title = ${input.title.trim() || 'Our wedding'}, partner_name = ${input.partnerName.trim()},
      wedding_date = ${input.weddingDate || null}, city_id = ${input.cityId}
    where id = ${weddingId}`;
}

/** Family and partner join with the wedding's code. */
export async function joinWedding(db: Db, code: string, profileId: string, role: 'partner' | 'family' | 'planner') {
  const [w] = await db<{ id: string }[]>`select id from mkt.weddings where join_code = ${code.trim().toUpperCase()}`;
  if (!w) throw new DomainError('bad_code', 'That code did not match a wedding');
  await db`
    insert into mkt.wedding_members (wedding_id, profile_id, role) values (${w.id}, ${profileId}, ${role})
    on conflict do nothing`;
  await audit(db, profileId, 'wedding.join', 'wedding', w.id, { role });
  return w;
}

export async function members(db: Db, weddingId: string) {
  return db<{ profile_id: string; full_name: string; email: string | null; role: string }[]>`
    select m.profile_id, p.full_name, p.email, m.role from mkt.wedding_members m
    join mkt.profiles p on p.id = m.profile_id where m.wedding_id = ${weddingId} order by m.created_at`;
}

// ---------------------------------------------------------------- checklist
export async function checklist(db: Db, weddingId: string) {
  return db<{ id: string; title: string; due_date: string | null; done: boolean; category_slug: string | null }[]>`
    select i.id, i.title, to_char(i.due_date, 'YYYY-MM-DD') as due_date, i.done, c.slug as category_slug
    from mkt.checklist_items i left join mkt.categories c on c.id = i.category_id
    where i.wedding_id = ${weddingId} order by i.done, i.due_date nulls last, i.sort`;
}

export async function toggleChecklist(db: Db, itemId: string, profileId: string) {
  const [i] = await db<{ wedding_id: string }[]>`select wedding_id from mkt.checklist_items where id = ${itemId}`;
  if (!i) throw new DomainError('not_found', 'Item not found');
  await assertMember(db, i.wedding_id, profileId);
  await db`update mkt.checklist_items set done = not done where id = ${itemId}`;
}

export async function addChecklistItem(db: Db, weddingId: string, profileId: string, title: string, dueDate: string | null) {
  await assertMember(db, weddingId, profileId);
  if (!title.trim()) throw new DomainError('empty', 'Name the task');
  await db`insert into mkt.checklist_items (wedding_id, title, due_date, sort) values (${weddingId}, ${title.trim()}, ${dueDate || null}, 999)`;
}

// ---------------------------------------------------------------- events, guests, RSVP
export async function events(db: Db, weddingId: string) {
  return db<{ id: string; name: string; starts_at: Date | null; venue: string }[]>`
    select id, name, starts_at, venue from mkt.wedding_events where wedding_id = ${weddingId} order by sort, starts_at`;
}

export async function addEvent(db: Db, weddingId: string, profileId: string, name: string, startsAt: string | null, venue: string) {
  await assertMember(db, weddingId, profileId);
  if (!name.trim()) throw new DomainError('empty', 'Name the event');
  await db`
    insert into mkt.wedding_events (wedding_id, name, starts_at, venue, sort)
    values (${weddingId}, ${name.trim()}, ${startsAt || null}, ${venue.trim()}, 50)`;
}

export async function guests(db: Db, weddingId: string) {
  return db<{ id: string; name: string; phone: string | null; side: string; group_name: string; rsvp_token: string; yes: number; pending: number }[]>`
    select g.id, g.name, g.phone, g.side, g.group_name, g.rsvp_token,
      (select count(*) from mkt.guest_rsvps r where r.guest_id = g.id and r.response = 'yes')::int as yes,
      ((select count(*) from mkt.wedding_events e where e.wedding_id = g.wedding_id)
        - (select count(*) from mkt.guest_rsvps r where r.guest_id = g.id and r.response <> 'pending'))::int as pending
    from mkt.guests g where g.wedding_id = ${weddingId} order by g.side, g.group_name, g.name`;
}

export async function addGuests(db: Db, weddingId: string, profileId: string, lines: string, side: 'bride' | 'groom' | 'common', group: string) {
  await assertMember(db, weddingId, profileId);
  // One guest per line: "Name, phone" (phone optional).
  const rows = lines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((l) => {
      const [name, phone] = l.split(',').map((x) => x.trim());
      return { name, phone: phone ? phone.replace(/[^\d+]/g, '') : null };
    })
    .filter((r) => r.name);
  for (const r of rows) {
    await db`
      insert into mkt.guests (wedding_id, name, phone, side, group_name)
      values (${weddingId}, ${r.name.slice(0, 120)}, ${r.phone}, ${side}, ${group.trim()})`;
  }
  return rows.length;
}

export async function rsvpByToken(db: Db, token: string) {
  const [g] = await db<{ id: string; name: string; wedding_id: string; title: string; partner_name: string; wedding_date: string | null }[]>`
    select g.id, g.name, g.wedding_id, w.title, w.partner_name, to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date
    from mkt.guests g join mkt.weddings w on w.id = g.wedding_id where g.rsvp_token = ${token}`;
  if (!g) return null;
  const evs = await db<{ id: string; name: string; starts_at: Date | null; venue: string; response: string; headcount: number }[]>`
    select e.id, e.name, e.starts_at, e.venue, coalesce(r.response, 'pending') as response, coalesce(r.headcount, 1)::int as headcount
    from mkt.wedding_events e
    left join mkt.guest_rsvps r on r.event_id = e.id and r.guest_id = ${g.id}
    where e.wedding_id = ${g.wedding_id} order by e.sort, e.starts_at`;
  return { guest: g, events: evs };
}

export async function saveRsvp(db: Db, token: string, answers: { eventId: string; response: string; headcount: number }[]) {
  const [g] = await db<{ id: string; wedding_id: string }[]>`select id, wedding_id from mkt.guests where rsvp_token = ${token}`;
  if (!g) throw new DomainError('not_found', 'Invitation not found');
  for (const a of answers) {
    if (!['yes', 'no', 'maybe'].includes(a.response)) continue;
    const [e] = await db`select 1 from mkt.wedding_events where id = ${a.eventId} and wedding_id = ${g.wedding_id}`;
    if (!e) continue;
    const hc = Math.max(0, Math.min(20, Math.round(a.headcount || 1)));
    await db`
      insert into mkt.guest_rsvps (guest_id, event_id, response, headcount)
      values (${g.id}, ${a.eventId}, ${a.response}, ${a.response === 'no' ? 0 : hc})
      on conflict (guest_id, event_id) do update set response = excluded.response, headcount = excluded.headcount, updated_at = now()`;
  }
}

export async function rsvpSummary(db: Db, weddingId: string) {
  return db<{ event_id: string; name: string; yes_heads: number; no: number; maybe: number; pending: number }[]>`
    select e.id as event_id, e.name,
      coalesce(sum(r.headcount) filter (where r.response = 'yes'), 0)::int as yes_heads,
      count(r.*) filter (where r.response = 'no')::int as no,
      count(r.*) filter (where r.response = 'maybe')::int as maybe,
      ((select count(*) from mkt.guests g where g.wedding_id = e.wedding_id) - count(r.*) filter (where r.response <> 'pending'))::int as pending
    from mkt.wedding_events e left join mkt.guest_rsvps r on r.event_id = e.id
    where e.wedding_id = ${weddingId} group by e.id order by e.sort`;
}

// ---------------------------------------------------------------- e-invites
// E-invites live in lib/invites.ts.

// ---------------------------------------------------------------- shortlist
export async function shortlist(db: Db, weddingId: string) {
  return db<{ vendor_id: string; slug: string; business_name: string; category_id: number; category_name: string; starting_price_inr: number | null; price_unit: string }[]>`
    select v.id as vendor_id, v.slug, v.business_name, v.category_id, c.name as category_name, v.starting_price_inr, c.price_unit
    from mkt.shortlist s join mkt.vendors v on v.id = s.vendor_id join mkt.categories c on c.id = v.category_id
    where s.wedding_id = ${weddingId} and v.status = 'live' order by c.sort, s.created_at`;
}

export async function toggleShortlist(db: Db, weddingId: string, vendorId: string, profileId: string) {
  await assertMember(db, weddingId, profileId);
  const [hit] = await db`delete from mkt.shortlist where wedding_id = ${weddingId} and vendor_id = ${vendorId} returning 1`;
  if (hit) return false;
  await db`insert into mkt.shortlist (wedding_id, vendor_id, added_by) values (${weddingId}, ${vendorId}, ${profileId})`;
  return true;
}

/**
 * "Ask all shortlisted": one enquiry with a need per shortlisted category.
 * It goes through the normal verification call, like every other lead.
 */
export async function askShortlisted(
  sql: Sql,
  weddingId: string,
  profile: { id: string; full_name: string; email: string | null; phone: string | null },
  phone: string
) {
  await assertMember(sql, weddingId, profile.id);
  const [w] = await sql<{ city_id: number | null; wedding_date: string | null }[]>`
    select city_id, to_char(wedding_date, 'YYYY-MM-DD') as wedding_date from mkt.weddings where id = ${weddingId}`;
  if (!w?.city_id) throw new DomainError('no_city', 'Add your wedding city first');
  const list = await shortlist(sql, weddingId);
  if (!list.length) throw new DomainError('empty', 'Your shortlist is empty');
  const byCategory = new Map<number, string[]>();
  for (const s of list) byCategory.set(s.category_id, [...(byCategory.get(s.category_id) ?? []), s.vendor_id]);
  return createEnquiry(sql, {
    brideProfileId: profile.id,
    weddingId,
    name: profile.full_name || 'Bride',
    phone: phone || profile.phone || '',
    email: profile.email,
    cityId: w.city_id,
    eventDate: w.wedding_date,
    source: 'shortlist',
    needs: Array.from(byCategory, ([categoryId, preferredVendorIds]) => ({ categoryId, preferredVendorIds })),
  });
}

/** Vendor ids the viewer's wedding has shortlisted, for filled hearts on cards. */
export async function shortlistedIds(db: Db, profileId: string | null | undefined) {
  if (!profileId) return new Set<string>();
  const rows = await db<{ vendor_id: string }[]>`
    select s.vendor_id from mkt.shortlist s join mkt.wedding_members m on m.wedding_id = s.wedding_id
    where m.profile_id = ${profileId}`;
  return new Set(rows.map((r) => r.vendor_id));
}
