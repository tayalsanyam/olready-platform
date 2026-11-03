-- Vendor date availability. Vendors mark days booked or closed (whole day, day or evening; per hall
-- for venues); OLReady bookings fill dates in on their own; a Google Calendar can be imported.
-- Capacity is in half-days: a full-day booking uses 2, a day or evening booking 1.

alter table mkt.vendors
  add column bookings_per_day smallint not null default 1 check (bookings_per_day between 1 and 20),
  add column calendar_updated_at timestamptz,
  add column calendar_reminded_at timestamptz,
  add column calendar_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column calendar_import_url text check (calendar_import_url is null or calendar_import_url ~ '^https://'),
  add column calendar_imported_at timestamptz,
  add column calendar_import_error text;
create unique index vendors_calendar_token_idx on mkt.vendors (calendar_token);

create table mkt.vendor_calendar (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  day date not null,
  slot text not null default 'full' check (slot in ('full', 'day', 'evening')),
  space_id uuid references mkt.venue_spaces(id) on delete cascade,
  status text not null check (status in ('booked', 'closed')),
  note text not null default '' check (length(note) <= 120),
  source text not null default 'vendor' check (source in ('vendor', 'olready', 'ops', 'import')),
  lead_need_id uuid references mkt.lead_needs(id) on delete set null,
  import_uid text,
  created_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now()
);
create index vendor_calendar_day_idx on mkt.vendor_calendar (vendor_id, day);
create unique index vendor_calendar_booking_idx on mkt.vendor_calendar (vendor_id, lead_need_id, day) where lead_need_id is not null;
create unique index vendor_calendar_import_idx on mkt.vendor_calendar (vendor_id, import_uid, day) where import_uid is not null;

/**
 * How full a vendor is on a day: 'closed' (marked closed), 'full' (no room left), 'some' (booked,
 * room left) or 'free' (nothing marked). Venues with halls have room per hall; others have
 * bookings_per_day. Whether 'free' can be trusted depends on calendar_updated_at, decided in the app.
 */
create or replace function mkt.vendor_day(p_vendor uuid, p_day date) returns text language sql stable as $$
  with v as (
    select v.id, v.bookings_per_day,
      (select count(*) from mkt.venue_spaces s where s.vendor_id = v.id) as spaces
    from mkt.vendors v where v.id = p_vendor
  ), e as (
    select c.* from mkt.vendor_calendar c where c.vendor_id = p_vendor and c.day = p_day
  ), cap as (
    select case when v.spaces > 0 then v.spaces * 2 else v.bookings_per_day * 2 end as units,
      v.spaces from v
  ), used as (
    select
      bool_or(e.status = 'closed' and e.space_id is null) as closed,
      -- A booking for the whole venue (no hall named) takes every hall.
      coalesce(sum((case when e.slot = 'full' then 2 else 1 end) * (case when e.space_id is null and cap.spaces > 0 then cap.spaces else 1 end)), 0) as units,
      count(*) as n
    from e, cap
  )
  select case
    when used.closed then 'closed'
    when used.n = 0 then 'free'
    when used.units >= cap.units then 'full'
    else 'some' end
  from used, cap
$$;

create or replace function mkt.vendor_busy(p_vendor uuid, p_day date) returns boolean language sql stable as $$
  select mkt.vendor_day(p_vendor, p_day) in ('closed', 'full')
$$;

-- Reporting (no notes, no brides).
create or replace view ops_reports.vendor_calendar as
  select vendor_id, day, slot, status, source, (space_id is not null) as for_a_hall, created_at from mkt.vendor_calendar;
grant select on ops_reports.vendor_calendar to ops_assistant;

insert into mkt.settings (key, value) values ('calendar_fresh_days', '45'), ('calendar_reminder_days', '30')
on conflict (key) do nothing;
