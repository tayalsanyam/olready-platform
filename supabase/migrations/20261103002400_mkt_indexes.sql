-- Indexes found missing by the load test (scripts/load-seed.sql, tests/eval/load.eval.test.ts).
create index if not exists leads_bride_idx on mkt.leads (bride_profile_id);
create index if not exists leads_wedding_idx on mkt.leads (wedding_id) where wedding_id is not null;
create index if not exists leads_created_idx on mkt.leads (created_at desc);
create index if not exists threads_vendor_idx on mkt.threads (vendor_id, created_at desc);
create index if not exists threads_created_idx on mkt.threads (created_at desc);
create index if not exists unlocks_vendor_idx on mkt.unlocks (vendor_id, created_at desc);
create index if not exists quotes_thread_idx on mkt.quotes (thread_id);
create index if not exists reviews_author_idx on mkt.reviews (author_profile_id);
create index if not exists reviews_created_idx on mkt.reviews (created_at desc);
create index if not exists lead_needs_booked_idx on mkt.lead_needs (booked_vendor_id) where booked_vendor_id is not null;
create index if not exists booking_reports_vendor_idx on mkt.booking_reports (vendor_id);
create index if not exists shortlist_vendor_idx on mkt.shortlist (vendor_id);
