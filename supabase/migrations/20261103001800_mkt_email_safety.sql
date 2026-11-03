-- Email safety: addresses we must not email (hard bounce, spam complaint, repeated soft
-- bounces, or the person unsubscribed), and a log of delivery events from Resend.
create table mkt.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('hard_bounce','complaint','soft_bounce','unsubscribed')),
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table mkt.email_events (
  id bigserial primary key,
  email text not null,
  type text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index email_events_email_idx on mkt.email_events (email, created_at desc);

alter table mkt.email_suppressions enable row level security;
alter table mkt.email_events enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
