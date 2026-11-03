-- Blog: articles written by the content team in Ops, in Markdown.
create table mkt.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 5 and 140),
  excerpt text not null default '' check (length(excerpt) <= 300),
  body text not null default '',
  cover_url text,
  section text not null default 'planning' check (section in ('planning','budget','ideas','fashion','vendors','real-talk')),
  category_id int references mkt.categories(id),
  city_id int references mkt.cities(id),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  author_profile_id uuid references mkt.profiles(id),
  author_name text not null default 'OLReady team',
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index articles_published_idx on mkt.articles (status, published_at desc);

-- People who asked for wedding ideas by email; double opt-in is not needed for a soft
-- newsletter, but every email carries an unsubscribe link (see unsubscribe_token).
create table mkt.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'blog',
  unsubscribed_at timestamptz,
  unsubscribe_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table mkt.articles enable row level security;
alter table mkt.newsletter_subscribers enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
