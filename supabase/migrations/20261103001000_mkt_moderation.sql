-- Chat safety: messages are flagged automatically (OTPs, card details, abuse, paying outside
-- Olready, unfamiliar links) or reported by the other side; Ops hide them or clear them.
alter table mkt.messages add column if not exists flags text[] not null default '{}';
alter table mkt.messages add column if not exists review_status text not null default 'none'
  check (review_status in ('none','flagged','cleared','hidden'));
alter table mkt.messages add column if not exists reviewed_by uuid references mkt.profiles(id);
alter table mkt.messages add column if not exists reviewed_at timestamptz;
create index if not exists messages_review_idx on mkt.messages (review_status) where review_status = 'flagged';

create table mkt.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references mkt.messages(id) on delete cascade,
  reported_by uuid not null references mkt.profiles(id),
  reason text not null check (reason in ('spam','abuse','payment_outside','fake','other')),
  note text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (message_id, reported_by)
);

alter table mkt.message_reports enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
