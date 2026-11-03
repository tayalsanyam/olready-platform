-- Which policy version each person accepted, and messages from the contact page.
alter table mkt.profiles add column if not exists terms_version text;
alter table mkt.profiles add column if not exists terms_accepted_at timestamptz;
alter table mkt.leads add column if not exists terms_version text;
alter table mkt.orders add column if not exists terms_version text;

create table if not exists mkt.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  topic text not null check (topic in ('bride', 'vendor', 'payment', 'privacy', 'grievance', 'press', 'other')),
  message text not null,
  visitor text,
  profile_id uuid references mkt.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done')),
  handled_by uuid references mkt.profiles(id),
  reply_note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists contact_messages_open_idx on mkt.contact_messages (created_at desc) where status = 'open';
alter table mkt.contact_messages enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
