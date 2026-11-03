-- E-invite studio: a library of original designs (layout x palette), filtered by culture and
-- theme, used for wedding cards and save-the-dates. Every design can also be downloaded as a
-- short video or an image in the browser, free.
alter table mkt.invite_templates add column if not exists kind text not null default 'card' check (kind in ('card','save_the_date'));
alter table mkt.invite_templates add column if not exists layout text not null default 'classic'
  check (layout in ('classic','arch','floral','mandala','modern','royal'));
alter table mkt.invite_templates add column if not exists culture text not null default 'generic';
alter table mkt.invite_templates add column if not exists themes text[] not null default '{}';
alter table mkt.invite_templates add column if not exists sort int not null default 0;

alter table mkt.invites add column if not exists kind text not null default 'card' check (kind in ('card','save_the_date'));
alter table mkt.invites add column if not exists opening_line text not null default '';
alter table mkt.invites add column if not exists bride_name text not null default '';
alter table mkt.invites add column if not exists groom_name text not null default '';
alter table mkt.invites add column if not exists family_line text not null default '';
alter table mkt.invites add column if not exists photo_url text;
alter table mkt.invites add column if not exists updated_at timestamptz not null default now();
create unique index if not exists invites_one_per_kind on mkt.invites (wedding_id, kind);
