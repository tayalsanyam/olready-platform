-- Each category gets details that fit its work (a makeup artist's brands and looks, a caterer's live counters),
-- grouped into sections, and every vendor gets a price list brides can read.
alter table mkt.category_fields add column if not exists section text;
alter table mkt.categories add column if not exists offer_presets jsonb not null default '[]';

create table if not exists mkt.vendor_offers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  price_inr int check (price_inr is null or price_inr >= 0),
  unit text not null default 'event' check (unit in ('event', 'day', 'hour', 'plate', 'person', 'piece', 'hand', 'set')),
  onwards boolean not null default false,
  details text not null default '' check (length(details) <= 300),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vendor_offers_vendor_idx on mkt.vendor_offers (vendor_id, sort);
alter table mkt.vendor_offers enable row level security;
