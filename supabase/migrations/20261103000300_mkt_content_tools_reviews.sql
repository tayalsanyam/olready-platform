-- Real Weddings, bride tools, reviews and disputes, email outbox, RLS lock-down.

-- ---------------------------------------------------------------- real weddings
create table mkt.real_weddings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  couple_names text not null,
  city_id int references mkt.cities(id),
  wedding_date date,
  story text not null default '',
  cover_image_url text,
  consent_confirmed boolean not null default false,
  submitted_by uuid references mkt.profiles(id),
  status text not null default 'submitted'
    check (status in ('draft','submitted','published','rejected')),
  review_note text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table mkt.real_wedding_photos (
  id uuid primary key default gen_random_uuid(),
  real_wedding_id uuid not null references mkt.real_weddings(id) on delete cascade,
  url text not null,
  caption text not null default '',
  vendor_id uuid references mkt.vendors(id),
  sort int not null default 0
);

create table mkt.real_wedding_vendors (
  real_wedding_id uuid not null references mkt.real_weddings(id) on delete cascade,
  vendor_id uuid not null references mkt.vendors(id),
  note text not null default '',
  vendor_confirmed boolean not null default false,
  primary key (real_wedding_id, vendor_id)
);

-- ---------------------------------------------------------------- bride tools
create table mkt.checklist_templates (
  id serial primary key,
  title text not null,
  months_before int not null,
  category_id int references mkt.categories(id),
  sort int not null default 0
);

create table mkt.checklist_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  title text not null,
  due_date date,
  category_id int references mkt.categories(id),
  done boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table mkt.wedding_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  name text not null,
  starts_at timestamptz,
  venue text not null default '',
  sort int not null default 0
);

create table mkt.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  side text not null default 'common' check (side in ('bride','groom','common')),
  group_name text not null default '',
  rsvp_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table mkt.guest_rsvps (
  guest_id uuid not null references mkt.guests(id) on delete cascade,
  event_id uuid not null references mkt.wedding_events(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending','yes','no','maybe')),
  headcount smallint not null default 1 check (headcount between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (guest_id, event_id)
);

create table mkt.invite_templates (
  id serial primary key,
  code text not null unique,
  name text not null,
  theme jsonb not null default '{}'::jsonb,
  price_inr int not null default 0,
  active boolean not null default true
);

create table mkt.invites (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  template_id int not null references mkt.invite_templates(id),
  slug text not null unique,
  headline text not null,
  message text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table mkt.shortlist (
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  vendor_id uuid not null references mkt.vendors(id),
  added_by uuid not null references mkt.profiles(id),
  created_at timestamptz not null default now(),
  primary key (wedding_id, vendor_id)
);

-- ---------------------------------------------------------------- reviews
create table mkt.reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id),
  author_profile_id uuid not null references mkt.profiles(id),
  lead_need_id uuid references mkt.lead_needs(id),
  rating_artist smallint not null check (rating_artist between 1 and 5),
  rating_service smallint not null check (rating_service between 1 and 5),
  body text not null default '',
  verified_booking boolean not null default false,
  status text not null default 'published'
    check (status in ('published','under_dispute','hidden','removed')),
  vendor_reply text,
  vendor_replied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_id, author_profile_id)
);

-- A vendor disputes a review. Ops must contact the vendor within 48 hours;
-- the vendor then has 7 days to submit proof, or the dispute expires.
create table mkt.review_disputes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references mkt.reviews(id) on delete cascade,
  vendor_id uuid not null references mkt.vendors(id),
  reason text not null,
  status text not null default 'open'
    check (status in ('open','awaiting_proof','proof_submitted','upheld','rejected','expired')),
  contact_due_at timestamptz not null,
  contacted_at timestamptz,
  proof_due_at timestamptz,
  proof text,
  decided_by uuid references mkt.profiles(id),
  decided_at timestamptz,
  outcome_note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- email outbox
create table mkt.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  dedupe_key text unique,
  payload jsonb not null default '{}'::jsonb,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- lock down the API
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'mkt' loop
    execute format('alter table mkt.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on schema mkt from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
    execute 'revoke all on schema mkt from anon, authenticated';
  end if;
end $$;
