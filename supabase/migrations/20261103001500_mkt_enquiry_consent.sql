-- WhatsApp updates only with the bride's explicit consent (never pre-ticked), recorded with a time.
alter table mkt.leads add column if not exists whatsapp_opt_in boolean not null default false;
alter table mkt.leads add column if not exists whatsapp_opt_in_at timestamptz;

-- Real weddings can be browsed by culture, like e-invites.
alter table mkt.real_weddings add column if not exists culture text not null default 'generic';
