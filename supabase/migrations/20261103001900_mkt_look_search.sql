-- Search by photo: a bride shows a look, decor or outfit she loves and sees vendors known for it.
-- The photo is read once into styles from a fixed list and thrown away; it is never stored.
alter table mkt.vendors add column if not exists known_for text[] not null default '{}' check (cardinality(known_for) <= 6);

create table mkt.look_usage (
  day date not null,
  visitor text not null,
  n int not null default 0,
  primary key (day, visitor)
);

insert into mkt.settings (key, value) values ('look_per_visitor_day', '15'), ('look_site_day', '3000') on conflict (key) do nothing;

alter table mkt.look_usage enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
