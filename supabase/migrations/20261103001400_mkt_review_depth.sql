-- Richer reviews: what the family spent, when the function was, and their photos.
alter table mkt.reviews add column if not exists amount_spent_inr int check (amount_spent_inr is null or amount_spent_inr between 0 and 100000000);
alter table mkt.reviews add column if not exists function_date date;
alter table mkt.reviews add column if not exists photos text[] not null default '{}' check (cardinality(photos) <= 5);
