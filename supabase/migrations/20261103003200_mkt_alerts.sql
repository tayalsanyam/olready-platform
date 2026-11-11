-- Notifications that were missing: request received, vendor profile and payment news, plan usage
-- nudges, booking recorded, review and dispute news, staff alerts, and unread markers in chats.
insert into mkt.whatsapp_templates (event) values
  ('request_received'), ('vendor_profile_live'), ('payment_received'), ('plan_started'), ('credits_low'),
  ('plan_usage_low'), ('booking_recorded_bride'), ('booking_recorded_vendor'), ('review_received'), ('staff_alert')
on conflict do nothing;

alter table mkt.whatsapp_outbox add column if not exists send_after timestamptz not null default now();

alter table mkt.threads add column if not exists bride_read_at timestamptz;
alter table mkt.threads add column if not exists vendor_read_at timestamptz;

insert into mkt.settings (key, value) values
  ('low_credit_threshold', '3'),
  ('plan_nudge_gap_pct', '25'),
  ('plan_nudge_every_days', '14'),
  ('staff_alerts_on', '1'),
  ('staff_quiet_from_hour', '21'),
  ('staff_quiet_to_hour', '9')
on conflict (key) do nothing;
