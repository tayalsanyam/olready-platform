-- What the verification call collects: each function can be in its own town at its own time of day,
-- plus a second phone, the partner's name, the best time to call and what she wants from each category.
alter table mkt.lead_events add column if not exists city_id int references mkt.cities(id);
alter table mkt.lead_events add column if not exists time_of_day text check (time_of_day in ('morning', 'day', 'evening'));
alter table mkt.leads add column if not exists alt_phone text;
alter table mkt.leads add column if not exists partner_name text;
alter table mkt.leads add column if not exists best_time text;
alter table mkt.lead_needs add column if not exists brief text;

-- The towns a category is needed in: the towns of its functions, or the request's town.
create or replace function mkt.need_city_ids(p_need uuid) returns int[]
language sql stable set search_path = mkt, public as $$
  select coalesce(
    (select array_agg(distinct coalesce(e.city_id, l.city_id))
       from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id join mkt.leads l on l.id = e.lead_id
      where ne.need_id = p_need),
    (select array[l.city_id] from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id where ln.id = p_need));
$$;
