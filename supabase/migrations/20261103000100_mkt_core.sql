-- Olready multi-category marketplace: core schema.
-- Add-on only: everything lives in the `mkt` schema, so the existing
-- sales-site tables in `public` and the legacy Laravel data are untouched.
-- RLS is enabled on every table with NO policies: the anon/authenticated
-- API keys can read nothing. The app talks to Postgres server-side only.

create schema if not exists mkt;

-- ---------------------------------------------------------------- settings
create table mkt.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into mkt.settings (key, value) values
  ('reopen_increment', '10'),
  ('max_reopen_rounds', '2'),
  ('booking_reward_credits', '1'),
  ('min_vendors_to_index', '3'),
  ('bride_perk_claim_days', '60'),
  ('bride_perk_length_days', '7'),
  ('review_contact_hours', '48'),
  ('review_proof_days', '7');

-- ---------------------------------------------------------------- people
create table mkt.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique,
  phone text,
  full_name text not null default '',
  role text not null check (role in ('bride','vendor','ops','rm','content','admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- geography
create table mkt.cities (
  id serial primary key,
  slug text not null unique,
  name text not null,
  state text not null,
  active boolean not null default true,
  sort int not null default 0
);

create table mkt.localities (
  id serial primary key,
  city_id int not null references mkt.cities(id),
  slug text not null,
  name text not null,
  unique (city_id, slug)
);

-- ---------------------------------------------------------------- taxonomy
create table mkt.categories (
  id serial primary key,
  slug text not null unique,
  name text not null,
  plural_name text not null,
  description text not null default '',
  wave smallint not null default 1,
  sort int not null default 0,
  active boolean not null default false,
  unlock_credit_cost int not null default 1 check (unlock_credit_cost > 0),
  unlock_cap int not null default 10 check (unlock_cap > 0),
  price_unit text not null default 'per function'
);

create table mkt.category_fields (
  id serial primary key,
  category_id int not null references mkt.categories(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  type text not null check (type in ('number','money','text','bool','select','multiselect')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  filterable boolean not null default false,
  on_card boolean not null default false,
  faq_question text,
  seo_slug text,
  sort int not null default 0,
  unique (category_id, key)
);

create table mkt.budget_tiers (
  id serial primary key,
  category_id int not null references mkt.categories(id) on delete cascade,
  code text not null,
  label text not null,
  min_inr int,
  max_inr int,
  sort int not null default 0,
  unique (category_id, code)
);

-- ---------------------------------------------------------------- vendors
create table mkt.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references mkt.profiles(id),
  legacy_artist_id bigint unique,
  category_id int not null references mkt.categories(id),
  city_id int not null references mkt.cities(id),
  locality_id int references mkt.localities(id),
  service_city_ids int[] not null default '{}',
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_name text not null,
  tagline text not null default '',
  about text not null default '',
  starting_price_inr int check (starting_price_inr is null or starting_price_inr >= 0),
  years_experience int,
  attributes jsonb not null default '{}'::jsonb,
  -- contact details are never shown to brides on the profile
  phone text,
  email text,
  instagram text,
  website text,
  cover_image_url text,
  status text not null default 'draft'
    check (status in ('draft','pending_review','live','suspended','closed')),
  claim_status text not null default 'claimed'
    check (claim_status in ('claimed','invited','unclaimed')),
  verified_at timestamptz,
  assured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendors_browse_idx on mkt.vendors (category_id, city_id) where status = 'live';
create index vendors_attrs_idx on mkt.vendors using gin (attributes);

create table mkt.vendor_media (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  url text not null,
  caption text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- A claim is how a vendor takes over a profile Ops built for them.
-- Ops never publishes a profile built from public data until it is claimed.
create table mkt.vendor_claims (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  invite_email text not null,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  profile_id uuid references mkt.profiles(id),
  status text not null default 'invited'
    check (status in ('invited','submitted','approved','rejected')),
  documents jsonb not null default '[]'::jsonb,
  note text not null default '',
  decided_by uuid references mkt.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit
create table mkt.audit_log (
  id bigserial primary key,
  actor_profile_id uuid references mkt.profiles(id),
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on mkt.audit_log (entity, entity_id);
