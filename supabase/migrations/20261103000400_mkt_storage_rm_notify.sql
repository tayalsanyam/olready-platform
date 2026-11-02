-- Public bucket for vendor and real-wedding photos (Supabase only; skipped on plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('olready-media', 'olready-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------- paid services for brides
create table mkt.services (
  code text primary key,
  name text not null,
  description text not null default '',
  price_inr int not null check (price_inr >= 0),
  length_days int not null check (length_days > 0),
  active boolean not null default true
);
insert into mkt.services (code, name, description, price_inr, length_days) values
  ('rm_30d', 'Relationship manager', 'An OLReady relationship manager shortlists vendors, negotiates, and coordinates for 30 days or until your wedding, whichever comes first.', 4999, 30);

alter table mkt.orders add column service_code text references mkt.services(code);
alter table mkt.orders add constraint orders_one_product check ((pack_id is null) <> (service_code is null));

-- A bride's RM engagement. Paid ones wait for approval; perk ones skip payment.
create table mkt.rm_engagements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references mkt.profiles(id),
  wedding_id uuid references mkt.weddings(id),
  source text not null check (source in ('paid','perk')),
  order_id uuid references mkt.orders(id),
  perk_id uuid references mkt.bride_perks(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','pending_approval','active','ended','rejected')),
  rm_profile_id uuid references mkt.profiles(id),
  length_days int not null,
  starts_at timestamptz,
  ends_at timestamptz,
  decided_by uuid references mkt.profiles(id),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index rm_engagements_status_idx on mkt.rm_engagements (status);

create table mkt.rm_notes (
  id bigserial primary key,
  engagement_id uuid not null references mkt.rm_engagements(id) on delete cascade,
  author_profile_id uuid not null references mkt.profiles(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- spam guard and notifications
create index leads_phone_recent_idx on mkt.leads (phone, created_at desc);
alter table mkt.profiles add column notify_email boolean not null default true;

alter table mkt.rm_engagements enable row level security;
alter table mkt.rm_notes enable row level security;
alter table mkt.services enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
