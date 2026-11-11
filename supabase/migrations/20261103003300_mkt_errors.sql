-- Crashes real visitors hit, grouped so one fault shows once with a count.
create table if not exists mkt.error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  kind text not null check (kind in ('server', 'client')),
  message text not null,
  stack text,
  path text,
  route text,
  route_type text,
  method text,
  digest text,
  user_agent text,
  occurrences int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references mkt.profiles(id)
);
create index if not exists error_events_open_idx on mkt.error_events (last_seen desc) where resolved_at is null;
alter table mkt.error_events enable row level security;
