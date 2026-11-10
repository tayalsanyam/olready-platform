-- Leads that arrive from ads: which campaign, and the ad platform's own id so the same lead is never added twice.
alter table mkt.leads add column if not exists campaign text;
alter table mkt.leads add column if not exists external_id text;
create unique index if not exists leads_external_id_key on mkt.leads (external_id) where external_id is not null;
create index if not exists leads_source_idx on mkt.leads (source, created_at desc);
