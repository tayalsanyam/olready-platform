-- Big days: a wedding is several functions, each with its own date and guests. A request
-- records them, each category says which functions it is for, and quotes can price each one.
create table mkt.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references mkt.leads(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  event_date date,
  guests int check (guests is null or guests between 1 and 20000),
  sort int not null default 0
);
create index lead_events_lead_idx on mkt.lead_events (lead_id, sort);

create table mkt.need_events (
  need_id uuid not null references mkt.lead_needs(id) on delete cascade,
  event_id uuid not null references mkt.lead_events(id) on delete cascade,
  primary key (need_id, event_id)
);
create index need_events_event_idx on mkt.need_events (event_id);

create table mkt.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references mkt.quotes(id) on delete cascade,
  label text not null check (length(label) between 1 and 60),
  amount_inr int not null check (amount_inr >= 0),
  sort int not null default 0
);
create index quote_lines_quote_idx on mkt.quote_lines (quote_id, sort);

-- Existing requests become one function each, so every lead reads the same way.
insert into mkt.lead_events (lead_id, name, event_date, guests)
select l.id, 'Wedding', l.event_date, l.guest_count from mkt.leads l
where not exists (select 1 from mkt.lead_events e where e.lead_id = l.id);
insert into mkt.need_events (need_id, event_id)
select ln.id, e.id from mkt.lead_needs ln join mkt.lead_events e on e.lead_id = ln.lead_id
on conflict do nothing;

alter table mkt.lead_events enable row level security;
alter table mkt.need_events enable row level security;
alter table mkt.quote_lines enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;

create or replace view ops_reports.lead_events as
  select e.id, e.lead_id, e.name, e.event_date, e.guests from mkt.lead_events e;
create or replace view ops_reports.quote_lines as
  select q.id, q.quote_id, q.label, q.amount_inr from mkt.quote_lines q;
grant select on ops_reports.lead_events, ops_reports.quote_lines to ops_assistant;
