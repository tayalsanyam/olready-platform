-- Refunds (through the gateway or recorded), discount codes on purchases, and a second
-- sign-in step (authenticator app) for staff.

alter table mkt.orders add column if not exists refunded_inr int not null default 0 check (refunded_inr >= 0);
alter table mkt.orders add column if not exists coupon_code text;
alter table mkt.orders add column if not exists discount_inr int not null default 0 check (discount_inr >= 0);
alter table mkt.orders add column if not exists list_price_inr int;

create table mkt.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references mkt.orders(id),
  amount_inr int not null check (amount_inr > 0),
  method text not null check (method in ('razorpay','payu','recorded')),
  gateway_refund_id text,
  reference text not null default '',
  reason text not null check (length(reason) between 3 and 500),
  took_back jsonb not null default '{}'::jsonb,
  created_by uuid not null references mkt.profiles(id),
  created_at timestamptz not null default now()
);
create index refunds_order_idx on mkt.refunds (order_id);

create table mkt.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,24}$'),
  kind text not null check (kind in ('percent','fixed')),
  value int not null check (value > 0),
  max_discount_inr int check (max_discount_inr is null or max_discount_inr > 0),
  min_amount_inr int not null default 0,
  applies_to text[] not null default '{}',   -- pack codes, 'wallet' or 'rm_30d'; empty = everything
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  per_buyer int not null default 1 check (per_buyer > 0),
  active boolean not null default true,
  note text not null default '',
  created_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

alter table mkt.profiles add column if not exists totp_secret text;
alter table mkt.profiles add column if not exists totp_enabled boolean not null default false;
alter table mkt.profiles add column if not exists totp_last_step bigint;

insert into mkt.settings (key, value) values ('staff_mfa_required', '0') on conflict (key) do nothing;

alter table mkt.refunds enable row level security;
alter table mkt.coupons enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
