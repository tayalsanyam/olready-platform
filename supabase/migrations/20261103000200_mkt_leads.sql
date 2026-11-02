-- Weddings, multi-category leads, credits, unlocks, conversations, bookings.

create table mkt.weddings (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references mkt.profiles(id),
  title text not null default 'Our wedding',
  partner_name text not null default '',
  wedding_date date,
  city_id int references mkt.cities(id),
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table mkt.wedding_members (
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  profile_id uuid not null references mkt.profiles(id),
  role text not null check (role in ('owner','partner','family','planner')),
  created_at timestamptz not null default now(),
  primary key (wedding_id, profile_id)
);

-- One lead per bride enquiry; one lead_need per category she needs.
create table mkt.leads (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references mkt.weddings(id),
  bride_profile_id uuid references mkt.profiles(id),
  bride_name text not null,
  phone text not null,
  email text,
  city_id int not null references mkt.cities(id),
  event_date date,
  source text not null default 'website'
    check (source in ('website','instagram','direct_request','shortlist','ops','legacy')),
  status text not null default 'new'
    check (status in ('new','verifying','verified','rejected','fake')),
  verification_stage smallint not null default 0 check (verification_stage between 0 and 3),
  verified_by uuid references mkt.profiles(id),
  verified_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index leads_status_idx on mkt.leads (status, created_at desc);

create table mkt.lead_needs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references mkt.leads(id) on delete cascade,
  category_id int not null references mkt.categories(id),
  budget_tier_id int references mkt.budget_tiers(id),
  budget_inr int,
  status text not null default 'open'
    check (status in ('open','capped','closed_booked','closed_by_bride','removed')),
  unlock_cap int not null check (unlock_cap > 0),
  reopen_rounds smallint not null default 0,
  direct_vendor_id uuid references mkt.vendors(id),
  -- vendors the bride shortlisted: they see this need first, flagged as shortlisted
  preferred_vendor_ids uuid[] not null default '{}',
  booked_vendor_id uuid references mkt.vendors(id),
  booked_outside jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (lead_id, category_id)
);
create index lead_needs_open_idx on mkt.lead_needs (category_id, status);

-- ---------------------------------------------------------------- packs, orders, credits
create table mkt.packs (
  id serial primary key,
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('plan','topup')),
  credits int not null check (credits > 0),
  price_inr int not null check (price_inr >= 0),
  validity_days int,
  category_ids int[],
  tier_codes text[],
  requires_contract boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  description text not null default ''
);

create table mkt.gateway_settings (
  gateway text primary key check (gateway in ('razorpay','payu','manual','test')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references mkt.profiles(id)
);
insert into mkt.gateway_settings (gateway, enabled) values
  ('razorpay', false), ('payu', false), ('manual', true), ('test', false);

create table mkt.orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references mkt.vendors(id),
  profile_id uuid not null references mkt.profiles(id),
  pack_id int references mkt.packs(id),
  amount_inr int not null check (amount_inr >= 0),
  gateway text not null references mkt.gateway_settings(gateway),
  gateway_order_id text,
  gateway_payment_id text,
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  buyer_gstin text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table mkt.vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id),
  pack_id int not null references mkt.packs(id),
  order_id uuid references mkt.orders(id),
  status text not null default 'pending_contract'
    check (status in ('pending_contract','active','expired','cancelled')),
  invoice_url text,
  contract_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  activated_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now()
);

-- Balance = sum(delta). credit_kind keeps plan and top-up credits apart,
-- because plan credits may be restricted to budget tiers and top-ups never are.
create table mkt.credit_ledger (
  id bigserial primary key,
  vendor_id uuid not null references mkt.vendors(id),
  credit_kind text not null check (credit_kind in ('plan','topup')),
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('purchase','unlock','refund_fake','booking_reward','adjustment','expiry')),
  ref_id uuid,
  note text not null default '',
  created_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now()
);
create index credit_ledger_vendor_idx on mkt.credit_ledger (vendor_id);

create table mkt.unlocks (
  id uuid primary key default gen_random_uuid(),
  lead_need_id uuid not null references mkt.lead_needs(id),
  vendor_id uuid not null references mkt.vendors(id),
  credits_spent int not null,
  credit_kind text not null check (credit_kind in ('plan','topup')),
  round smallint not null default 0,
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lead_need_id, vendor_id)
);

-- ---------------------------------------------------------------- conversations
create table mkt.threads (
  id uuid primary key default gen_random_uuid(),
  lead_need_id uuid not null references mkt.lead_needs(id),
  vendor_id uuid not null references mkt.vendors(id),
  status text not null default 'open'
    check (status in ('open','quoted','quote_accepted','booked','closed')),
  created_at timestamptz not null default now(),
  unique (lead_need_id, vendor_id)
);

create table mkt.messages (
  id bigserial primary key,
  thread_id uuid not null references mkt.threads(id) on delete cascade,
  sender_profile_id uuid not null references mkt.profiles(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on mkt.messages (thread_id, created_at);

create table mkt.quotes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references mkt.threads(id) on delete cascade,
  amount_inr int not null check (amount_inr > 0),
  details text not null default '',
  status text not null default 'sent' check (status in ('sent','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Either side's report confirms the booking. The reward goes only to the reporter.
create table mkt.booking_reports (
  id uuid primary key default gen_random_uuid(),
  lead_need_id uuid not null references mkt.lead_needs(id),
  vendor_id uuid not null references mkt.vendors(id),
  reported_by uuid not null references mkt.profiles(id),
  reporter_side text not null check (reporter_side in ('bride','vendor')),
  amount_inr int,
  created_at timestamptz not null default now(),
  unique (lead_need_id, reporter_side)
);

create table mkt.bride_perks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references mkt.profiles(id),
  perk text not null check (perk in ('rm_access_7d','stickers','class_entry')),
  booking_report_id uuid references mkt.booking_reports(id),
  claim_by timestamptz not null,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
