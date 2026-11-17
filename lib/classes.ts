import { DomainError, type Db, type Sql } from './db';
import { normalisePhone } from './leads';
import { saveCapture } from './captures';
import { queueEmail } from './email';

/** Trades that teach. A class is run and charged for by the artist; Olready lists it and passes on seat requests. */
export const TEACHING = ['bridal-makeup', 'mehendi-artists'];
export const LEVELS = { beginner: 'Beginner', intermediate: 'Some experience', pro: 'For working artists' } as const;
export const MODES = { in_person: 'In person', online: 'Online' } as const;

export type ClassRow = {
  id: string; vendor_id: string; title: string; summary: string; level: keyof typeof LEVELS; mode: keyof typeof MODES; city_id: number | null; city: string | null;
  venue: string; starts_at: Date; duration_min: number; seats: number; fee_inr: number; includes: string; status: 'live' | 'hidden' | 'cancelled';
  vendor: string; vendor_slug: string; category: string; taken: number;
};

const SELECT = `
  cl.id, cl.vendor_id, cl.title, cl.summary, cl.level, cl.mode, cl.city_id, ci.name as city, cl.venue, cl.starts_at, cl.duration_min, cl.seats,
  cl.fee_inr, cl.includes, cl.status, v.business_name as vendor, v.slug as vendor_slug, cat.name as category,
  (select count(*) from mkt.class_signups s where s.class_id = cl.id and s.status <> 'cancelled')::int as taken`;
const FROM = `mkt.classes cl join mkt.vendors v on v.id = cl.vendor_id join mkt.categories cat on cat.id = v.category_id left join mkt.cities ci on ci.id = cl.city_id`;

/** Upcoming classes anyone can see: live, in the future, by a vendor whose profile is live. */
export async function upcomingClasses(db: Db, opts: { citySlug?: string | null; vendorId?: string | null; limit?: number } = {}) {
  return db<ClassRow[]>`
    select ${db.unsafe(SELECT)} from ${db.unsafe(FROM)}
    where cl.status = 'live' and cl.starts_at > now() and v.status = 'live'
      ${opts.citySlug ? db`and (ci.slug = ${opts.citySlug} or cl.mode = 'online')` : db``}
      ${opts.vendorId ? db`and cl.vendor_id = ${opts.vendorId}` : db``}
    order by cl.starts_at limit ${opts.limit ?? 60}`;
}

export async function getClass(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db<ClassRow[]>`select ${db.unsafe(SELECT)} from ${db.unsafe(FROM)} where cl.id = ${id}`;
  return c ?? null;
}

export async function canTeach(db: Db, vendorId: string) {
  const [v] = await db<{ slug: string }[]>`select c.slug from mkt.vendors v join mkt.categories c on c.id = v.category_id where v.id = ${vendorId}`;
  return Boolean(v && TEACHING.includes(v.slug));
}

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? '').trim().replace(/[ \t]+/g, ' ').slice(0, max);
const CONTACT = /(\+?\d[\d\s-]{8,}\d)|(https?:\/\/|www\.)|@[a-z0-9_.]{3,}/i;

/** Reads the class form. Dates are typed in India time. */
export function classFromForm(fd: FormData) {
  const title = text(fd, 'title', 90);
  if (title.length < 4) throw new DomainError('title', 'Give the class a name');
  const day = text(fd, 'day', 10);
  const time = text(fd, 'time', 5) || '11:00';
  const starts = new Date(`${day}T${time}:00+05:30`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(starts.getTime())) throw new DomainError('day', 'Pick the date of the class');
  if (starts.getTime() < Date.now() + 3600e3) throw new DomainError('day', 'The class must be in the future');
  const n = (k: string, lo: number, hi: number, what: string) => {
    const v = Number(String(fd.get(k) ?? '').replace(/[^\d]/g, ''));
    if (!Number.isInteger(v) || v < lo || v > hi) throw new DomainError(k, `${what} must be between ${lo.toLocaleString('en-IN')} and ${hi.toLocaleString('en-IN')}`);
    return v;
  };
  const mode = fd.get('mode') === 'online' ? 'online' : 'in_person';
  const level = (String(fd.get('level')) in LEVELS ? String(fd.get('level')) : 'beginner') as keyof typeof LEVELS;
  const summary = text(fd, 'summary', 800);
  const includes = text(fd, 'includes', 300);
  const venue = text(fd, 'venue', 120);
  // Seats are requested through Olready, so a class cannot carry its own phone number, link or handle.
  if ([title, summary, includes, venue].some((t) => CONTACT.test(t))) throw new DomainError('contact', 'Leave out phone numbers, links and handles. Seat requests reach you here.');
  return {
    title, summary, includes, venue, mode, level, starts_at: starts,
    duration_min: Math.round(n('hours_x10', 5, 480, 'Length') * 6),
    seats: n('seats', 1, 500, 'Seats'),
    fee_inr: n('fee_inr', 0, 500000, 'Fee'),
    city_id: mode === 'online' ? null : Number(fd.get('city_id')) || null,
  };
}

export async function createClass(db: Db, vendorId: string, input: ReturnType<typeof classFromForm>) {
  if (!(await canTeach(db, vendorId))) throw new DomainError('not_teaching', 'Classes are open to makeup and mehendi artists');
  const [v] = await db<{ status: string; city_id: number }[]>`select status, city_id from mkt.vendors where id = ${vendorId}`;
  if (v.status !== 'live') throw new DomainError('not_live', 'Your profile must be live before you list a class');
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.classes where vendor_id = ${vendorId} and status = 'live' and starts_at > now()`;
  if (n >= 12) throw new DomainError('too_many', 'You can list up to 12 upcoming classes');
  const [c] = await db<{ id: string }[]>`
    insert into mkt.classes (vendor_id, title, summary, level, mode, city_id, venue, starts_at, duration_min, seats, fee_inr, includes)
    values (${vendorId}, ${input.title}, ${input.summary}, ${input.level}, ${input.mode}, ${input.mode === 'online' ? null : (input.city_id ?? v.city_id)},
      ${input.venue}, ${input.starts_at}, ${input.duration_min}, ${input.seats}, ${input.fee_inr}, ${input.includes}) returning id`;
  return c.id;
}

/** The artist cancels her own class; Ops hides or restores any class. */
export async function setClassStatus(db: Db, id: string, status: 'live' | 'hidden' | 'cancelled', by: { vendorId?: string }) {
  const rows = await db`
    update mkt.classes set status = ${status}, updated_at = now()
    where id = ${id} ${by.vendorId ? db`and vendor_id = ${by.vendorId}` : db``} returning id`;
  if (!rows.length) throw new DomainError('not_found', 'Class not found');
}

/**
 * A visitor asks for a seat. Her name and number go to the artist for this class (the form says so), and to the
 * team's Numbers to call, because someone learning bridal makeup is often planning a wedding.
 */
export async function requestSeat(sql: Sql, classId: string, input: { name: string; phone: string; note?: string; visitor?: string | null }) {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.length < 2) throw new DomainError('name', 'Tell us your name');
  const phone = normalisePhone(input.phone);
  const note = (input.note ?? '').trim().slice(0, 300);
  const out = await sql.begin(async (tx) => {
    const [c] = await tx<{ id: string; title: string; seats: number; vendor_id: string; vendor: string; slug: string; email: string | null; ok: boolean }[]>`
      select cl.id, cl.title, cl.seats, cl.vendor_id, v.business_name as vendor, v.slug, coalesce(p.email, v.email) as email,
        (cl.status = 'live' and cl.starts_at > now() and v.status = 'live') as ok
      from mkt.classes cl join mkt.vendors v on v.id = cl.vendor_id left join mkt.profiles p on p.id = v.owner_profile_id
      where cl.id = ${classId} for update of cl`;
    if (!c || !c.ok) throw new DomainError('closed', 'This class is no longer taking requests');
    const [again] = await tx`select 1 from mkt.class_signups where class_id = ${classId} and phone = ${phone}`;
    if (again) return { ...c, repeat: true };
    const [{ taken }] = await tx<{ taken: number }[]>`select count(*)::int as taken from mkt.class_signups where class_id = ${classId} and status <> 'cancelled'`;
    if (taken >= c.seats) throw new DomainError('full', 'This class is full');
    await tx`insert into mkt.class_signups (class_id, name, phone, note) values (${classId}, ${name}, ${phone}, ${note})`;
    if (c.email) await queueEmail(tx, c.email, 'class_signup', { business: c.vendor, name: name.split(' ')[0], title: c.title, taken: taken + 1, seats: c.seats }, `class:${classId}:${phone.slice(-6)}`);
    return { ...c, repeat: false };
  });
  if (!out.repeat) {
    await saveCapture(sql, { phone, name, source: 'class', page: `/v/${out.slug}`, note: `Asked for a seat in "${out.title}" by ${out.vendor}.`, visitor: input.visitor ?? null }).catch(() => null);
  }
  return { title: out.title, vendor: out.vendor, repeat: out.repeat };
}

export type Signup = { id: string; name: string; phone: string; note: string; status: 'new' | 'confirmed' | 'cancelled'; created_at: Date };

/** The artist's own classes, newest first, each with the people who asked for a seat. */
export async function classesForVendor(db: Db, vendorId: string) {
  const classes = await db<ClassRow[]>`select ${db.unsafe(SELECT)} from ${db.unsafe(FROM)} where cl.vendor_id = ${vendorId} order by cl.starts_at desc limit 40`;
  const signups = classes.length
    ? await db<(Signup & { class_id: string })[]>`
        select id, class_id, name, phone, note, status, created_at from mkt.class_signups where class_id = any(${classes.map((c) => c.id)}) order by created_at`
    : [];
  return classes.map((c) => ({ ...c, signups: signups.filter((s) => s.class_id === c.id) }));
}

export async function setSignupStatus(db: Db, vendorId: string, signupId: string, status: 'confirmed' | 'cancelled') {
  const rows = await db`
    update mkt.class_signups s set status = ${status} from mkt.classes cl
    where s.id = ${signupId} and cl.id = s.class_id and cl.vendor_id = ${vendorId} returning s.id`;
  if (!rows.length) throw new DomainError('not_found', 'Request not found');
}

export async function allClasses(db: Db) {
  return db<ClassRow[]>`select ${db.unsafe(SELECT)} from ${db.unsafe(FROM)} order by (cl.starts_at < now()), cl.starts_at limit 200`;
}

export const classWhen = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d);
export const classLength = (min: number) => (min % 60 === 0 ? `${min / 60} ${min === 60 ? 'hour' : 'hours'}` : `${(min / 60).toFixed(1)} hours`);
export const classFee = (inr: number) => (inr === 0 ? 'Free' : `₹${inr.toLocaleString('en-IN')}`);
