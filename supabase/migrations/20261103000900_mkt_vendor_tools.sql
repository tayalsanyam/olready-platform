-- Vendor tools: review requests for clients booked outside Olready, files in chat, callback requests.

-- Reviews from invited clients wait for Ops before they show.
alter table mkt.reviews drop constraint if exists reviews_status_check;
alter table mkt.reviews add constraint reviews_status_check
  check (status in ('pending','published','under_dispute','hidden','removed'));
alter table mkt.reviews add column if not exists source text not null default 'olready'
  check (source in ('olready','vendor_invite'));

create table mkt.review_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  client_name text not null check (length(client_name) between 1 and 80),
  client_email text not null check (client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'sent' check (status in ('sent','used','cancelled')),
  review_id uuid references mkt.reviews(id),
  created_by uuid not null references mkt.profiles(id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  unique (vendor_id, client_email)
);

-- One file per message: a brochure, menu or reference photo.
alter table mkt.messages add column if not exists attachment_url text;
alter table mkt.messages add column if not exists attachment_name text;
alter table mkt.messages add column if not exists attachment_kind text check (attachment_kind in ('image','pdf'));
alter table mkt.messages drop constraint if exists messages_body_check;
alter table mkt.messages add constraint messages_body_check
  check (length(body) <= 4000 and (length(body) >= 1 or attachment_url is not null));

-- "Call me" requests from vendors and brides, worked by Ops.
create table mkt.callback_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references mkt.profiles(id),
  vendor_id uuid references mkt.vendors(id),
  topic text not null check (topic in ('plans','leads','profile','payments','booking','other')),
  phone text not null,
  preferred_time text not null default '',
  note text not null default '' check (length(note) <= 500),
  status text not null default 'open' check (status in ('open','done')),
  handled_by uuid references mkt.profiles(id),
  outcome text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index callback_open_idx on mkt.callback_requests (status, created_at);

alter table mkt.review_requests enable row level security;
alter table mkt.callback_requests enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
