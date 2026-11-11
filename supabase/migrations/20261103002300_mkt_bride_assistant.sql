-- Ask Olready: the brides' planning helper.

create table mkt.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references mkt.profiles(id) on delete cascade,
  wedding_id uuid references mkt.weddings(id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_threads_profile_idx on mkt.assistant_threads (profile_id, updated_at desc);

-- content holds the model-facing blocks (text, tool_use, tool_result); text is what the bride sees.
create table mkt.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references mkt.assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  text text not null default '',
  tools_used text[] not null default '{}',
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index assistant_messages_thread_idx on mkt.assistant_messages (thread_id, created_at);
create index assistant_messages_flagged_idx on mkt.assistant_messages (created_at desc) where cardinality(flags) > 0;

-- Changes the helper proposes. Nothing happens until the bride confirms.
create table mkt.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references mkt.assistant_threads(id) on delete cascade,
  message_id uuid references mkt.assistant_messages(id) on delete cascade,
  kind text not null check (kind in ('shortlist', 'checklist', 'category_budget')),
  payload jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index assistant_actions_thread_idx on mkt.assistant_actions (thread_id, created_at);

create table mkt.assistant_feedback (
  message_id uuid not null references mkt.assistant_messages(id) on delete cascade,
  profile_id uuid not null references mkt.profiles(id) on delete cascade,
  helpful boolean not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

insert into mkt.settings (key, value) values
  ('bride_assistant_on', '1'), ('bride_assistant_per_day', '40'), ('bride_assistant_site_day', '5000'),
  ('bride_assistant_keep_days', '90')
on conflict (key) do nothing;

alter table mkt.assistant_threads enable row level security;
alter table mkt.assistant_messages enable row level security;
alter table mkt.assistant_actions enable row level security;
alter table mkt.assistant_feedback enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;

-- Usage for the Ops assistant's reporting views: counts only, no text.
create or replace view ops_reports.bride_assistant as
  select m.id, m.thread_id, m.role, m.tools_used, m.flags, m.created_at,
         (select f.helpful from mkt.assistant_feedback f where f.message_id = m.id limit 1) as helpful
  from mkt.assistant_messages m;
grant select on ops_reports.bride_assistant to ops_assistant;
