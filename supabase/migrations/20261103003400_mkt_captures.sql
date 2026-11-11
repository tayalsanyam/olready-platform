-- Visitors who are not signed in: the numbers they leave for a call, and their chats with the helper.
create table if not exists mkt.captures (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text,
  source text not null check (source in ('slip', 'exit', 'chat', 'shortlist', 'dock')),
  page text,
  city_id int references mkt.cities(id),
  category_id int references mkt.categories(id),
  vendor_slugs text[] not null default '{}',
  note text not null default '',
  chat_id uuid,
  visitor text,
  status text not null default 'open' check (status in ('open', 'converted', 'closed')),
  outcome text,
  lead_id uuid references mkt.leads(id),
  handled_by uuid references mkt.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists captures_open_idx on mkt.captures (created_at) where status = 'open';
create index if not exists captures_phone_idx on mkt.captures (phone, created_at desc);
alter table mkt.captures enable row level security;

create table if not exists mkt.visitor_chats (
  id uuid primary key default gen_random_uuid(),
  visitor text not null,
  ip_key text,
  page text,
  messages jsonb not null default '[]',
  slugs text[] not null default '{}',
  questions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visitor_chats_visitor_idx on mkt.visitor_chats (visitor, created_at desc);
create index if not exists visitor_chats_day_idx on mkt.visitor_chats (created_at);
alter table mkt.visitor_chats enable row level security;

insert into mkt.settings (key, value) values
  ('visitor_ai_on', '1'),
  ('visitor_ai_free', '2'),
  ('visitor_ai_per_day', '8'),
  ('visitor_ai_site_day', '1500'),
  ('capture_prompts_on', '1'),
  ('capture_prompt_seconds', '45'),
  ('capture_prompt_views', '3')
on conflict (key) do nothing;
