-- Wedding budget: an overall figure, a plan per category, and other costs (outfits, gifts,
-- vendors booked outside Olready). Quotes and bookings come from the conversations.
alter table mkt.weddings add column if not exists total_budget_inr bigint check (total_budget_inr is null or total_budget_inr between 0 and 10000000000);
-- Who in the family sees the numbers: 'owners' = the couple only, 'family' = every member.
alter table mkt.weddings add column if not exists budget_visibility text not null default 'owners' check (budget_visibility in ('owners','family'));

create table mkt.category_budgets (
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  category_id int not null references mkt.categories(id),
  budget_inr bigint not null check (budget_inr between 0 and 10000000000),
  primary key (wedding_id, category_id)
);

create table mkt.budget_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references mkt.weddings(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  category_id int references mkt.categories(id),
  amount_inr bigint not null check (amount_inr between 0 and 10000000000),
  paid_inr bigint not null default 0 check (paid_inr >= 0),
  created_by uuid not null references mkt.profiles(id),
  created_at timestamptz not null default now()
);
create index budget_items_wedding_idx on mkt.budget_items (wedding_id);

alter table mkt.category_budgets enable row level security;
alter table mkt.budget_items enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mkt from anon, authenticated';
  end if;
end $$;
