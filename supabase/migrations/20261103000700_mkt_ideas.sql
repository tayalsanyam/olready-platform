-- Inspiration gallery: vendor work photos and published real-wedding photos, grouped into
-- topics (one per category, plus real weddings) and tagged by vendors and Ops.
create table mkt.idea_topics (
  id serial primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  category_id int unique references mkt.categories(id),
  sort int not null default 0
);

create table mkt.idea_tags (
  id serial primary key,
  topic_id int not null references mkt.idea_topics(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null,
  sort int not null default 0,
  unique (topic_id, slug)
);

alter table mkt.vendor_media add column if not exists tags text[] not null default '{}';
alter table mkt.vendor_media add column if not exists hidden_from_ideas boolean not null default false;
alter table mkt.real_wedding_photos add column if not exists tags text[] not null default '{}';
alter table mkt.real_wedding_photos add column if not exists hidden_from_ideas boolean not null default false;

-- What a family saves for later: gallery photos, articles and notes. Shortlisted vendors stay in mkt.shortlist.
create table mkt.saved_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  kind text not null check (kind in ('photo','article')),
  ref text not null,
  note text not null default '' check (length(note) <= 500),
  saved_by uuid not null references mkt.profiles(id),
  created_at timestamptz not null default now(),
  unique (wedding_id, kind, ref)
);

alter table mkt.idea_topics enable row level security;
alter table mkt.idea_tags enable row level security;
alter table mkt.saved_items enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
