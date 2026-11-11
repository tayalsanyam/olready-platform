-- Links to the older Olready systems: plans carried over from the Laravel merchant site,
-- and staff whose access is managed in the sales-site admin.

-- Re-running the plan import updates the same row instead of creating a second plan.
alter table mkt.vendor_subscriptions add column if not exists legacy_ref text unique;

-- Where a staff role came from. 'sales_admin' rows are kept in step with the sales site;
-- roles set by hand in Ops are never overwritten by the sync.
alter table mkt.profiles add column if not exists role_source text not null default 'platform'
  check (role_source in ('platform','sales_admin'));
