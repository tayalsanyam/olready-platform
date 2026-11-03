-- Listing depth: price-band filters per category, more venue types, halls inside a venue,
-- and curated collections ("Best farmhouses for small weddings in Mohali").

-- Price bands filter on starting_price_inr, e.g. [{"seo":"under-1000","label":"Under ₹1,000","max":999}].
alter table mkt.categories add column if not exists price_bands jsonb not null default '[]'::jsonb;

-- Marriage palaces are how Punjab searches for venues; add them, heritage and terrace venues.
update mkt.category_fields f
set options = f.options || '[{"value":"palace","label":"Marriage palace","seo":"marriage-palaces"},{"value":"heritage","label":"Heritage property","seo":"heritage"},{"value":"terrace","label":"Terrace or rooftop","seo":"terrace"}]'::jsonb
from mkt.categories c
where c.id = f.category_id and c.slug = 'venues' and f.key = 'venue_type' and not f.options @> '[{"value":"palace"}]'::jsonb;
update mkt.category_fields f
set options = f.options || '[{"value":"terrace","label":"Terrace","seo":"terrace-venues"}]'::jsonb
from mkt.categories c
where c.id = f.category_id and c.slug = 'venues' and f.key = 'setting' and not f.options @> '[{"value":"terrace"}]'::jsonb;

-- Halls and lawns inside one venue, each with its own capacity.
create table mkt.venue_spaces (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null check (kind in ('indoor','outdoor','poolside','terrace')),
  seating int check (seating is null or seating between 1 and 20000),
  floating int check (floating is null or floating between 1 and 20000),
  sort int not null default 0
);
create index venue_spaces_vendor_idx on mkt.venue_spaces (vendor_id, sort);

-- Curated lists written by the content team.
create table mkt.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 5 and 120),
  intro text not null default '',
  category_id int references mkt.categories(id),
  city_id int references mkt.cities(id),
  vendor_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published')),
  updated_by uuid references mkt.profiles(id),
  updated_at timestamptz not null default now()
);

alter table mkt.venue_spaces enable row level security;
alter table mkt.collections enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
