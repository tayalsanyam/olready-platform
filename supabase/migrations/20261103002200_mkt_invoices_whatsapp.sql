-- GST tax invoices and credit notes, issued by OLReady itself, and the WhatsApp channel.

-- One running number per document kind per financial year (April to March).
create table mkt.invoice_counters (
  kind text not null check (kind in ('invoice', 'credit_note')),
  fy text not null,
  last int not null default 0,
  primary key (kind, fy)
);

-- Every figure is frozen at issue, so a later change to a price, a name or an address never
-- rewrites a document that was already sent. Money is in paise.
create table mkt.tax_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invoice', 'credit_note')),
  number text not null unique,
  fy text not null,
  seq int not null,
  order_id uuid not null references mkt.orders(id),
  refund_id uuid unique references mkt.refunds(id),
  original_id uuid references mkt.tax_documents(id),
  issued_at timestamptz not null default now(),
  seller jsonb not null,       -- name, address, gstin, state, state_code
  buyer jsonb not null,        -- name, address, gstin, state, state_code
  place_of_supply text not null,
  description text not null,
  sac text not null,
  list_paise bigint not null,
  discount_paise bigint not null default 0,
  taxable_paise bigint not null,
  cgst_paise bigint not null default 0,
  sgst_paise bigint not null default 0,  -- SGST, or UTGST for a union territory
  igst_paise bigint not null default 0,
  total_paise bigint not null,
  rate_pct numeric(5,2) not null default 18,
  utgst boolean not null default false,
  created_by uuid references mkt.profiles(id),
  unique (kind, fy, seq)
);
create unique index tax_documents_one_invoice on mkt.tax_documents (order_id) where kind = 'invoice';
create index tax_documents_order_idx on mkt.tax_documents (order_id);

-- WhatsApp: off until a provider is configured and a template is mapped and switched on.
create table mkt.whatsapp_templates (
  event text primary key,
  template_name text not null default '',
  language text not null default 'en',
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references mkt.profiles(id)
);

insert into mkt.whatsapp_templates (event) values
  ('request_verified'), ('quote_received'), ('bride_message'), ('vendor_new_lead'), ('vendor_message'), ('quote_accepted')
on conflict do nothing;

create table mkt.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  event text not null references mkt.whatsapp_templates(event),
  params text[] not null default '{}',
  dedupe_key text unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index whatsapp_outbox_queue_idx on mkt.whatsapp_outbox (created_at) where status = 'queued';
create index whatsapp_outbox_msg_idx on mkt.whatsapp_outbox (provider_message_id);

-- Numbers that replied STOP. Checked at queue time, whatever the opt-in on a request says.
create table mkt.whatsapp_optouts (
  phone text primary key,
  created_at timestamptz not null default now()
);

-- Vendors choose WhatsApp alerts themselves; never on by default.
alter table mkt.vendors add column if not exists whatsapp_alerts boolean not null default false;
alter table mkt.vendors add column if not exists whatsapp_alerts_at timestamptz;

alter table mkt.invoice_counters enable row level security;
alter table mkt.tax_documents enable row level security;
alter table mkt.whatsapp_templates enable row level security;
alter table mkt.whatsapp_outbox enable row level security;
alter table mkt.whatsapp_optouts enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;

-- The reporting views gain invoice totals (no names or addresses).
create or replace view ops_reports.tax_documents as
  select id, kind, number, fy, order_id, issued_at, place_of_supply, sac, taxable_paise / 100.0 as taxable_inr,
         (cgst_paise + sgst_paise + igst_paise) / 100.0 as gst_inr, total_paise / 100.0 as total_inr
  from mkt.tax_documents;
grant select on ops_reports.tax_documents to ops_assistant;

-- Billing details a vendor can keep on file for their tax invoices.
alter table mkt.vendors add column if not exists legal_name text;
alter table mkt.vendors add column if not exists billing_address text;
alter table mkt.vendors add column if not exists gstin text;
