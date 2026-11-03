-- Venues, caterers, planners, bridal wear and jewellery (data is in seed/reference.sql).
-- Venues and caterers quote per plate, so a lead carries the expected guest count.
alter table mkt.leads add column if not exists guest_count int check (guest_count is null or guest_count between 1 and 20000);
