-- Fills a database with production-sized data for timing queries. Run only on a throwaway
-- database: DATABASE_URL=.../olready_load node scripts/migrate.mjs --reset && psql ... -f scripts/load-seed.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
-- People: 20,000 brides, 5,000 vendor owners.
insert into mkt.profiles (email, full_name, role)
select 'bride' || g || '@load.test', 'Bride ' || g, 'bride' from generate_series(1, 20000) g;
insert into mkt.profiles (email, full_name, role)
select 'owner' || g || '@load.test', 'Owner ' || g, 'vendor' from generate_series(1, 5000) g;

-- 5,000 live vendors spread over the active categories and cities.
with cats as (select array_agg(id order by id) a from mkt.categories where active),
     cities as (select array_agg(id order by id) a from mkt.cities)
insert into mkt.vendors (owner_profile_id, category_id, city_id, service_city_ids, slug, business_name, tagline, about,
  starting_price_inr, attributes, phone, email, status, claim_status, verified_at, assured, created_at)
select p.id, cats.a[1 + g % array_length(cats.a, 1)], cities.a[1 + (g * 7) % array_length(cities.a, 1)],
  array[cities.a[1 + (g * 7) % array_length(cities.a, 1)], cities.a[1 + (g * 3) % array_length(cities.a, 1)]],
  'load-vendor-' || g, 'Load Vendor ' || g, 'Tricity weddings since ' || (2000 + g % 25), repeat('Experienced wedding team. ', 20),
  500 + (g * 37) % 150000,
  jsonb_build_object('capacity_max', 100 + (g * 13) % 1500, 'airbrush', g % 2 = 0, 'veg_price', 600 + g % 900),
  '98' || lpad((g)::text, 8, '0'), 'vendor' || g || '@load.test', 'live', 'claimed',
  case when g % 3 = 0 then now() end, g % 10 = 0, now() - (g % 700) * interval '1 day'
from generate_series(1, 5000) g join mkt.profiles p on p.email = 'owner' || g || '@load.test', cats, cities;

-- 50,000 leads over the last year, 70% verified, one to three categories each.
with cities as (select array_agg(id order by id) a from mkt.cities)
insert into mkt.leads (bride_profile_id, bride_name, phone, email, city_id, event_date, guest_count, status, verification_stage, verified_at, created_at, source)
select p.id, 'Bride ' || g, '97' || lpad(g::text, 8, '0'), 'bride' || g || '@load.test', cities.a[1 + g % array_length(cities.a, 1)],
  current_date + (g % 300), 100 + g % 900,
  case when g % 10 < 7 then 'verified' else 'new' end, case when g % 10 < 7 then 3 else 0 end,
  case when g % 10 < 7 then now() - (g % 365) * interval '1 day' + interval '2 hours' end,
  now() - (g % 365) * interval '1 day', 'website'
from generate_series(1, 50000) g join mkt.profiles p on p.email = 'bride' || (1 + g % 20000) || '@load.test', cities;

with cats as (select array_agg(id order by id) a from mkt.categories where active)
insert into mkt.lead_needs (lead_id, category_id, unlock_cap, budget_inr, status, created_at)
select l.id, cats.a[1 + (abs(hashtext(l.id::text)) + k) % array_length(cats.a, 1)], 10, 20000 + (abs(hashtext(l.id::text)) % 300000), 'open', l.created_at
from mkt.leads l, cats, generate_series(0, 2) k
where k <= abs(hashtext(l.id::text)) % 3
on conflict do nothing;

-- Up to four unlocks per verified need from vendors in that category and city, with a thread each.
insert into mkt.unlocks (lead_need_id, vendor_id, credits_spent, credit_kind, round, created_at)
select ln.id, v.id, 1, 'topup', 1, ln.created_at + interval '3 hours'
from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id and l.status = 'verified'
cross join lateral (
  select v.id from mkt.vendors v where v.category_id = ln.category_id and v.city_id = l.city_id
  order by abs(hashtext(v.id::text || ln.id::text)) limit 1 + abs(hashtext(ln.id::text)) % 4) v
on conflict do nothing;
insert into mkt.threads (lead_need_id, vendor_id, status, created_at)
select lead_need_id, vendor_id, case when abs(hashtext(vendor_id::text)) % 4 = 0 then 'quoted' else 'open' end, created_at from mkt.unlocks
on conflict do nothing;

-- Messages: about 200,000.
insert into mkt.messages (thread_id, sender_profile_id, body, created_at)
select t.id, case when k % 2 = 0 then v.owner_profile_id else l.bride_profile_id end,
  case when k % 2 = 0 then 'Thanks for reaching out, here is what we offer for your date.' else 'What would it cost for 300 guests?' end,
  t.created_at + k * interval '20 minutes'
from mkt.threads t join mkt.vendors v on v.id = t.vendor_id join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id,
  generate_series(0, 3) k;

insert into mkt.quotes (thread_id, amount_inr, details, status, created_at)
select t.id, 15000 + abs(hashtext(t.id::text)) % 400000, 'Full day, team of three, travel within Tricity included.', 'sent', t.created_at + interval '1 day'
from mkt.threads t where t.status = 'quoted';

-- Reviews: one per bride per vendor for a slice of threads.
insert into mkt.reviews (vendor_id, author_profile_id, rating_artist, rating_service, body, status, verified_booking, created_at)
select distinct on (t.vendor_id, l.bride_profile_id) t.vendor_id, l.bride_profile_id, 3 + abs(hashtext(t.id::text)) % 3, 3 + abs(hashtext(t.vendor_id::text)) % 3,
  'Lovely to work with and on time.', 'published', abs(hashtext(t.id::text)) % 2 = 0, t.created_at + interval '30 days'
from mkt.threads t join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id
where abs(hashtext(t.id::text)) % 4 = 0
on conflict do nothing;

-- 30 days of profile analytics for every vendor.
insert into mkt.vendor_daily (vendor_id, day, views, impressions, quote_starts, photo_views)
select v.id, current_date - d, abs(hashtext(v.id::text || d)) % 40, abs(hashtext(v.id::text || d)) % 400, abs(hashtext(v.id::text || d)) % 3, abs(hashtext(v.id::text || d)) % 20
from mkt.vendors v, generate_series(0, 29) d
on conflict do nothing;
commit;
analyze;
select (select count(*) from mkt.vendors) vendors, (select count(*) from mkt.leads) leads, (select count(*) from mkt.lead_needs) needs,
       (select count(*) from mkt.unlocks) unlocks, (select count(*) from mkt.messages) messages, (select count(*) from mkt.reviews) reviews,
       (select count(*) from mkt.vendor_daily) daily;
