-- Every town in India is launched. Menus and quick picks still show a short, ranked list
-- (lib/catalog.ts listCities): the Tricity first, then the big wedding cities, then towns with vendors.
update mkt.cities set launched = true where not launched;
alter table mkt.cities alter column launched set default true;
