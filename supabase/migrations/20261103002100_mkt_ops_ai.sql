-- Ops data and AI helpers.
-- ops_reports: views with no phone numbers, emails, addresses or brides' names. The Ops
-- assistant's queries run as ops_assistant, which can read these views and nothing else.
create schema if not exists ops_reports;

create or replace view ops_reports.vendors as
  select v.id, v.business_name, c.slug as category, ci.slug as city, v.status, v.claim_status,
         v.verified_at is not null as verified, v.assured, v.starting_price_inr, v.years_experience, v.created_at
  from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id;

create or replace view ops_reports.leads as
  select l.id, ci.slug as city, l.event_date, l.guest_count, l.source, l.status, l.verification_stage, l.verified_at, l.created_at,
         l.whatsapp_opt_in
  from mkt.leads l join mkt.cities ci on ci.id = l.city_id;

create or replace view ops_reports.lead_needs as
  select ln.id, ln.lead_id, c.slug as category, ln.status, ln.budget_inr, ln.unlock_cap, ln.reopen_rounds,
         ln.direct_vendor_id is not null as direct_request, ln.booked_vendor_id, ln.created_at
  from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id;

create or replace view ops_reports.unlocks as
  select id, lead_need_id, vendor_id, credits_spent, credit_kind, round, refunded, created_at from mkt.unlocks;

create or replace view ops_reports.threads as
  select t.id, t.lead_need_id, t.vendor_id, t.status, t.created_at,
         (select count(*) from mkt.messages m where m.thread_id = t.id) as messages
  from mkt.threads t;

create or replace view ops_reports.quotes as
  select q.id, q.thread_id, q.amount_inr, q.status, q.created_at, q.decided_at from mkt.quotes q;

create or replace view ops_reports.bookings as
  select lead_need_id, vendor_id, reporter_side, amount_inr, created_at from mkt.booking_reports;

create or replace view ops_reports.reviews as
  select id, vendor_id, rating_artist, rating_service, verified_booking, status, source, amount_spent_inr, created_at from mkt.reviews;

create or replace view ops_reports.orders as
  select o.id, o.vendor_id, coalesce(p.code, o.service_code, case when o.wallet_topup_inr is not null then 'wallet' end) as product,
         p.kind as pack_kind, o.amount_inr, o.discount_inr, o.coupon_code, o.refunded_inr, o.gateway, o.status, o.created_at, o.paid_at
  from mkt.orders o left join mkt.packs p on p.id = o.pack_id;

create or replace view ops_reports.subscriptions as
  select s.id, s.vendor_id, p.code as plan, s.status, s.starts_at, s.ends_at, s.created_at
  from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id;

create or replace view ops_reports.credit_ledger as
  select vendor_id, credit_kind, delta, reason, created_at from mkt.credit_ledger;

create or replace view ops_reports.vendor_daily as
  select vendor_id, day, views, impressions, quote_starts, photo_views from mkt.vendor_daily;

create or replace view ops_reports.boosts as
  select b.id, b.vendor_id, b.status, b.daily_budget_inr, b.price_per_visit_inr, b.starts_on, b.ends_on, b.created_at,
         (select coalesce(sum(charged_inr), 0) from mkt.boost_visits v where v.boost_id = b.id) as spent_inr,
         (select count(*) from mkt.boost_visits v where v.boost_id = b.id and v.charged_inr > 0) as paid_visits
  from mkt.boosts b;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ops_assistant') then
    create role ops_assistant nologin;
  end if;
  execute format('grant ops_assistant to %I', current_user);
end $$;
revoke all on schema mkt from ops_assistant;
grant usage on schema ops_reports to ops_assistant;
grant select on all tables in schema ops_reports to ops_assistant;
-- Views run with their owner's rights; ops_assistant itself can touch nothing else.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema ops_reports from anon, authenticated';
  end if;
end $$;

create table mkt.ops_assistant_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references mkt.profiles(id),
  kind text not null default 'ask' check (kind in ('ask', 'rerun')),
  question text not null,
  sql text,
  answer text,
  row_count int,
  error text,
  columns text[],
  rows jsonb,
  created_at timestamptz not null default now()
);
create index ops_assistant_log_idx on mkt.ops_assistant_log (profile_id, created_at desc);

-- A quote read once by AI into what is included, what costs extra and what to ask.
create table mkt.quote_readings (
  quote_id uuid primary key references mkt.quotes(id) on delete cascade,
  included text[] not null default '{}',
  extra text[] not null default '{}',
  ask text[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into mkt.settings (key, value) values
  ('ops_assistant_per_person_day', '150'), ('ops_assistant_team_day', '1000'),
  ('quote_reader_site_day', '4000')
on conflict (key) do nothing;

alter table mkt.ops_assistant_log enable row level security;
alter table mkt.quote_readings enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
