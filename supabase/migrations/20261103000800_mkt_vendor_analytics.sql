-- Vendor analytics: daily counters, one row per vendor per day (India time).
-- views: profile opened (one per visitor per day); impressions: card shown in a listing;
-- quote_starts: the quote form opened for this vendor; photo_views: a gallery photo of theirs opened.
create table mkt.vendor_daily (
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  day date not null,
  views int not null default 0,
  impressions int not null default 0,
  quote_starts int not null default 0,
  photo_views int not null default 0,
  primary key (vendor_id, day)
);

-- Visitor de-duplication for views. visitor is a salted hash of network and browser, never stored raw.
create table mkt.vendor_view_seen (
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  day date not null,
  visitor text not null,
  primary key (vendor_id, day, visitor)
);

alter table mkt.vendor_daily enable row level security;
alter table mkt.vendor_view_seen enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
