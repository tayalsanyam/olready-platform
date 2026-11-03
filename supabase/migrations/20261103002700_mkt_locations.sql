-- Locations: states with GST codes, towns tied to states, India Post pincodes mapped to our towns,
-- localities (sectors, phases, roads), and full addresses for vendors and requests.

create table mkt.states (
  code text primary key check (code ~ '^\d{2}$'),
  name text not null unique,
  kind text not null check (kind in ('state', 'ut')),
  active boolean not null default true
);

insert into mkt.states (code, name, kind) values
  ('01', 'Jammu and Kashmir', 'ut'), ('02', 'Himachal Pradesh', 'state'), ('03', 'Punjab', 'state'), ('04', 'Chandigarh', 'ut'),
  ('05', 'Uttarakhand', 'state'), ('06', 'Haryana', 'state'), ('07', 'Delhi', 'ut'), ('08', 'Rajasthan', 'state'),
  ('09', 'Uttar Pradesh', 'state'), ('10', 'Bihar', 'state'), ('11', 'Sikkim', 'state'), ('12', 'Arunachal Pradesh', 'state'),
  ('13', 'Nagaland', 'state'), ('14', 'Manipur', 'state'), ('15', 'Mizoram', 'state'), ('16', 'Tripura', 'state'),
  ('17', 'Meghalaya', 'state'), ('18', 'Assam', 'state'), ('19', 'West Bengal', 'state'), ('20', 'Jharkhand', 'state'),
  ('21', 'Odisha', 'state'), ('22', 'Chhattisgarh', 'state'), ('23', 'Madhya Pradesh', 'state'), ('24', 'Gujarat', 'state'),
  ('26', 'Dadra and Nagar Haveli and Daman and Diu', 'ut'), ('27', 'Maharashtra', 'state'), ('29', 'Karnataka', 'state'),
  ('30', 'Goa', 'state'), ('31', 'Lakshadweep', 'ut'), ('32', 'Kerala', 'state'), ('33', 'Tamil Nadu', 'state'),
  ('34', 'Puducherry', 'ut'), ('35', 'Andaman and Nicobar Islands', 'ut'), ('36', 'Telangana', 'state'),
  ('37', 'Andhra Pradesh', 'state'), ('38', 'Ladakh', 'ut');

-- Towns: the state is a code now; the name column stays in step for older readers (invoices, exports).
-- Every district in India is a town (data/towns.csv, loaded by scripts/migrate.mjs). active = can be
-- chosen anywhere; launched = shown in menus, the home page and the footer.
alter table mkt.cities
  add column state_code text references mkt.states(code),
  add column district text not null default '',
  add column districts text[] not null default '{}',
  add column aliases text[] not null default '{}',
  add column launched boolean not null default false,
  add column lat numeric(8, 5),
  add column lng numeric(8, 5);
update mkt.cities set launched = true;
update mkt.cities set slug = 'delhi', name = 'Delhi' where slug = 'delhi-ncr' and not exists (select 1 from mkt.cities where slug = 'delhi');
create index cities_launched_idx on mkt.cities (sort) where active and launched;
update mkt.cities c set state_code = s.code from mkt.states s where lower(s.name) = lower(c.state);
update mkt.cities set state_code = '04' where state_code is null;
alter table mkt.cities alter column state_code set not null;

create or replace function mkt.city_state_name() returns trigger language plpgsql as $$
begin
  select name into new.state from mkt.states where code = new.state_code;
  return new;
end $$;
create trigger cities_state_name before insert or update of state_code on mkt.cities
  for each row execute function mkt.city_state_name();
-- Inserts that still pass only a state name get the code from it.
create or replace function mkt.city_state_code() returns trigger language plpgsql as $$
begin
  if new.state_code is null and new.state is not null then
    select code into new.state_code from mkt.states where lower(name) = lower(new.state);
  end if;
  return new;
end $$;
create trigger cities_state_code before insert on mkt.cities for each row execute function mkt.city_state_code();
-- Postgres fires same-event triggers in name order: cities_state_code runs before cities_state_name.

-- India Post pincodes (data.gov.in All India Pincode Directory, Government Open Data License - India).
-- city_id maps a pincode to one of our towns; manual = set by Ops, never overwritten by the mapper.
create table mkt.pincodes (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  state_code text not null references mkt.states(code),
  district text not null default '',
  offices text[] not null default '{}',
  city_id integer references mkt.cities(id),
  manual boolean not null default false
);
create index pincodes_city_idx on mkt.pincodes (city_id) where city_id is not null;

-- Localities: sectors, phases, colonies, roads. pincode is a hint shown on forms.
alter table mkt.localities
  add column kind text not null default 'area' check (kind in ('sector', 'phase', 'area', 'road', 'village')),
  add column pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  add column sort integer not null default 0,
  add column active boolean not null default true,
  add column aliases text[] not null default '{}',
  add column source text not null default 'curated' check (source in ('curated', 'post_office', 'ops')),
  add constraint localities_name_check check (length(name) between 1 and 80);
create index localities_city_idx on mkt.localities (city_id, sort) where active;

-- Vendor address. Venues show the full address by default; artists who work from home show the area only.
alter table mkt.vendors
  add column address_line text check (address_line is null or length(address_line) <= 200),
  add column pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  add column lat numeric(8, 5) check (lat is null or lat between 6 and 37),
  add column lng numeric(8, 5) check (lng is null or lng between 68 and 98),
  add column maps_url text check (maps_url is null or length(maps_url) <= 500),
  add column address_public boolean not null default false,
  add column billing_state_code text references mkt.states(code),
  add column billing_pincode text check (billing_pincode is null or billing_pincode ~ '^[1-9][0-9]{5}$');
create index vendors_locality_idx on mkt.vendors (locality_id) where status = 'live' and locality_id is not null;

-- Where the wedding is: an area for the whole request, and a place per function (home, venue, gurdwara).
alter table mkt.leads
  add column locality_id integer references mkt.localities(id),
  add column pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
alter table mkt.lead_events add column place text check (place is null or length(place) <= 80);
alter table mkt.weddings
  add column locality_id integer references mkt.localities(id),
  add column pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');

/**
 * Maps pincodes to towns: first the Tricity towns carved out of the Mohali district by their post
 * offices' pincodes, then every other pincode by its district. Rows Ops set by hand are kept.
 */
create or replace function mkt.map_pincodes() returns integer language plpgsql as $$
declare n integer;
begin
  with pins(slug, pins) as (values
    ('chandigarh', array['160014']),
    ('mohali', array['160055', '160059', '160062', '160071', '140308', '140306']),
    ('kharar', array['140301', '140307']),
    ('zirakpur', array['140603', '140604', '160104']),
    ('dera-bassi', array['140507', '140506', '140501']),
    ('new-chandigarh', array['140901', '160103'])
  ), hits as (
    select distinct on (p.pincode) p.pincode, c.id as city_id
    from mkt.pincodes p
    join mkt.cities c on c.slug in (select slug from pins where p.pincode = any(pins))
      or (c.state_code = p.state_code and p.district = any(c.districts))
    order by p.pincode, (c.slug in (select slug from pins where p.pincode = any(pins))) desc, c.id
  )
  update mkt.pincodes p set city_id = h.city_id from hits h where p.pincode = h.pincode and not p.manual and p.city_id is distinct from h.city_id;
  get diagnostics n = row_count;
  -- The Mohali-district pincodes are still filed under Rupnagar and Patiala in the directory, and
  -- several Mohali post offices carry their old "Chandigarh Sector N" names.
  update mkt.pincodes p set district = 'SAS Nagar (Mohali)',
    offices = array(select regexp_replace(o, '^Chandigarh Sector (\d+)$', 'Sector \1 (Mohali)') from unnest(p.offices) o)
  from mkt.cities c
  where c.id = p.city_id and c.slug in ('mohali', 'kharar', 'zirakpur', 'dera-bassi', 'new-chandigarh') and p.district <> 'SAS Nagar (Mohali)';
  return n;
end $$;

-- Reporting views for Ask the data (no addresses).
create or replace view ops_reports.vendor_areas as
  select v.id as vendor_id, c.slug as category, ci.name as town, l.name as area, v.pincode, v.status
  from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
  left join mkt.localities l on l.id = v.locality_id;
grant select on ops_reports.vendor_areas to ops_assistant;
