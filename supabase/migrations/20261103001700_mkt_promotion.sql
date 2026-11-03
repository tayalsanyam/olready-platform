-- Paid promotion. Always labelled Sponsored; never changes the order of the regular results.
--   Ads wallet: vendors top up (GST included), Boosts and banners spend from it.
--   Boosts: a fixed price per profile visit from a Sponsored card, once per visitor per day.
--   Banners: monthly slots on the home page and city pages, reviewed by Ops before they show.

alter table mkt.orders add column if not exists wallet_topup_inr int check (wallet_topup_inr is null or wallet_topup_inr between 500 and 500000);
alter table mkt.orders drop constraint if exists orders_one_product;
alter table mkt.orders add constraint orders_one_product
  check (num_nonnulls(pack_id, service_code, wallet_topup_inr) = 1);

create table mkt.ad_wallet_ledger (
  id bigserial primary key,
  vendor_id uuid not null references mkt.vendors(id),
  delta_inr int not null check (delta_inr <> 0),
  reason text not null check (reason in ('topup','boost_visit','banner','banner_refund','adjustment')),
  ref_id text,
  note text not null default '',
  created_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now()
);
create index ad_wallet_vendor_idx on mkt.ad_wallet_ledger (vendor_id);

create table mkt.boosts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id),
  city_ids int[] not null default '{}',          -- empty = every city the vendor serves
  placements text[] not null check (placements <@ array['search','profiles','home']::text[] and cardinality(placements) > 0),
  price_per_visit_inr int not null check (price_per_visit_inr > 0),
  daily_budget_inr int not null check (daily_budget_inr >= 50),
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  paused_by_ops boolean not null default false,
  created_at timestamptz not null default now()
);
create index boosts_live_idx on mkt.boosts (status, starts_on);

create table mkt.boost_visits (
  boost_id uuid not null references mkt.boosts(id) on delete cascade,
  day date not null,
  visitor text not null,
  charged_inr int not null default 0,
  placement text not null default 'search',
  created_at timestamptz not null default now(),
  primary key (boost_id, day, visitor)
);


create table mkt.banners (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references mkt.vendors(id),
  placement text not null check (placement in ('home','city')),
  city_id int references mkt.cities(id),
  month date not null check (extract(day from month) = 1),
  headline text not null check (length(headline) between 5 and 90),
  image_url text not null,
  link_url text not null,
  price_inr int not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reject_reason text not null default '',
  decided_by uuid references mkt.profiles(id),
  created_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now(),
  check ((placement = 'city') = (city_id is not null))
);
create index banners_month_idx on mkt.banners (placement, month, status);

insert into mkt.settings (key, value) values
  ('boost_price_per_visit', '15'),
  ('banner_price_home', '12000'),
  ('banner_price_city', '5000'),
  ('banner_slots', '3'),
  ('banners_self_serve', '1')
on conflict (key) do nothing;

alter table mkt.ad_wallet_ledger enable row level security;
alter table mkt.boosts enable row level security;
alter table mkt.boost_visits enable row level security;
alter table mkt.banners enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
