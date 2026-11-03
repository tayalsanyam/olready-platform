import type { Db } from './db';
import { DomainError, audit } from './db';

// Places across India: states, towns (one per district, plus the Tricity towns), areas and pincodes.
// Pincodes come from the India Post directory; each maps to one of our towns.

export type State = { code: string; name: string; kind: 'state' | 'ut' };
export type Locality = { id: number; city_id: number; slug: string; name: string; kind: string; pincode: string | null };
export type Place =
  | { kind: 'town'; city_id: number; city: string; state: string; slug: string; launched: boolean }
  | { kind: 'pincode'; city_id: number | null; city: string | null; state: string; pincode: string; area: string | null; locality_id: number | null }
  | { kind: 'area'; city_id: number; city: string; state: string; locality_id: number; area: string; pincode: string | null };

export const PINCODE = /^[1-9][0-9]{5}$/;

export async function listStates(db: Db) {
  return db<State[]>`select code, name, kind from mkt.states where active order by name`;
}

const like = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * What a person typed into a town box: a pincode ("160022"), a town or one of its old names
 * ("Gurgaon"), or, inside a town, an area ("Sector 35"). Launched towns rank first.
 */
export async function searchPlaces(db: Db, raw: string, opts: { cityId?: number | null; limit?: number } = {}): Promise<Place[]> {
  const q = raw.trim().replace(/\s+/g, ' ').slice(0, 60);
  const limit = Math.min(opts.limit ?? 8, 20);
  const cityId = opts.cityId ?? null;
  if (/^\d{3,6}$/.test(q)) {
    const rows = await db<{ pincode: string; city_id: number | null; city: string | null; state: string; offices: string[] }[]>`
      select p.pincode, p.city_id, c.name as city, s.name as state, p.offices
      from mkt.pincodes p join mkt.states s on s.code = p.state_code left join mkt.cities c on c.id = p.city_id
      where p.pincode like ${like(q) + '%'} and (${cityId}::int is null or p.city_id = ${cityId})
      order by p.pincode limit ${limit}`;
    const locs = await localitiesForPincodes(db, rows.map((r) => r.pincode));
    return rows.map((r) => {
      const l = locs.get(r.pincode);
      return { kind: 'pincode', pincode: r.pincode, city_id: r.city_id, city: r.city, state: r.state, area: l?.name ?? tidyOffice(r.offices[0]), locality_id: l?.id ?? null };
    });
  }
  if (q.length < 2) return [];
  const pat = `${like(q.toLowerCase())}%`;
  const word = `% ${like(q.toLowerCase())}%`;
  if (cityId) {
    const rows = await db<{ id: number; name: string; pincode: string | null; city: string; state: string }[]>`
      select l.id, l.name, l.pincode, c.name as city, c.state
      from mkt.localities l join mkt.cities c on c.id = l.city_id
      where l.city_id = ${cityId} and l.active
        and (lower(l.name) like ${pat} or lower(l.name) like ${word} or exists (select 1 from unnest(l.aliases) a where lower(a) like ${pat}))
      order by (lower(l.name) like ${pat}) desc, l.source = 'curated' desc, l.sort, length(l.name), l.name limit ${limit}`;
    return rows.map((r) => ({ kind: 'area', city_id: cityId, city: r.city, state: r.state, locality_id: r.id, area: r.name, pincode: r.pincode }));
  }
  const rows = await db<{ id: number; slug: string; name: string; state: string; launched: boolean }[]>`
    select c.id, c.slug, c.name, c.state, c.launched from mkt.cities c
    where c.active and (lower(c.name) like ${pat} or lower(c.name) like ${word}
      or exists (select 1 from unnest(c.aliases) a where lower(a) like ${pat} or lower(a) like ${word}))
    order by c.launched desc, (lower(c.name) like ${pat}) desc, length(c.name), c.name limit ${limit}`;
  return rows.map((r) => ({ kind: 'town', city_id: r.id, slug: r.slug, city: r.name, state: r.state, launched: r.launched }));
}

/** "Sector 35 (Chandigarh) S.O" style names, tidied for display. */
export function tidyOffice(name: string | undefined) {
  if (!name) return null;
  return name.replace(/\s*\((East|West|North|South|Central)\)\s*$/i, ' $1').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim() || null;
}

async function localitiesForPincodes(db: Db, pins: string[]) {
  if (!pins.length) return new Map<string, { id: number; name: string }>();
  const rows = await db<{ pincode: string; id: number; name: string }[]>`
    select distinct on (pincode) pincode, id, name from mkt.localities
    where pincode = any(${pins}::text[]) and active order by pincode, source = 'curated' desc, sort, id`;
  return new Map(rows.map((r) => [r.pincode, { id: r.id, name: r.name }]));
}

export async function pincodeInfo(db: Db, pin: string) {
  if (!PINCODE.test(pin)) return null;
  const [p] = await db<{ pincode: string; city_id: number | null; city: string | null; city_slug: string | null; state_code: string; state: string; district: string; offices: string[] }[]>`
    select p.pincode, p.city_id, c.name as city, c.slug as city_slug, p.state_code, s.name as state, p.district, p.offices
    from mkt.pincodes p join mkt.states s on s.code = p.state_code left join mkt.cities c on c.id = p.city_id
    where p.pincode = ${pin}`;
  return p ?? null;
}

export async function localitiesFor(db: Db, cityId: number, opts: { withVendorsOnly?: boolean; categoryId?: number } = {}) {
  if (opts.withVendorsOnly) {
    return db<(Locality & { vendors: number })[]>`
      select l.id, l.city_id, l.slug, l.name, l.kind, l.pincode, count(v.id)::int as vendors
      from mkt.localities l join mkt.vendors v on v.locality_id = l.id and v.status = 'live'
        and (${opts.categoryId ?? null}::int is null or v.category_id = ${opts.categoryId ?? null})
      where l.city_id = ${cityId} and l.active group by l.id order by count(v.id) desc, l.sort, l.name`;
  }
  return db<Locality[]>`
    select id, city_id, slug, name, kind, pincode from mkt.localities where city_id = ${cityId} and active order by sort, name`;
}

export async function localityBySlug(db: Db, cityId: number, slug: string) {
  const [l] = await db<Locality[]>`select id, city_id, slug, name, kind, pincode from mkt.localities where city_id = ${cityId} and slug = ${slug} and active`;
  return l ?? null;
}

export async function getLocality(db: Db, id: number | null | undefined) {
  if (!id) return null;
  const [l] = await db<(Locality & { city: string })[]>`
    select l.id, l.city_id, l.slug, l.name, l.kind, l.pincode, c.name as city from mkt.localities l join mkt.cities c on c.id = l.city_id where l.id = ${id}`;
  return l ?? null;
}

/**
 * Checks a town, area and pincode belong together. A pincode on its own picks the town and area.
 * Returns the cleaned values to store.
 */
export async function resolvePlace(db: Db, input: { cityId: number | null; localityId: number | null; pincode: string | null }) {
  let { cityId, localityId } = input;
  const pincode = input.pincode?.replace(/\s/g, '') || null;
  if (pincode && !PINCODE.test(pincode)) throw new DomainError('bad_pincode', 'A pincode is 6 digits, like 160022');
  const pin = pincode ? await pincodeInfo(db, pincode) : null;
  if (pincode && !pin) throw new DomainError('unknown_pincode', `We could not find pincode ${pincode}. Check it, or leave it blank.`);
  if (!cityId && pin?.city_id) cityId = pin.city_id;
  if (!cityId) throw new DomainError('no_town', 'Choose your town');
  const [town] = await db<{ id: number; name: string }[]>`select id, name from mkt.cities where id = ${cityId} and active`;
  if (!town) throw new DomainError('bad_town', 'Choose a town from the list');
  if (pin && pin.city_id && pin.city_id !== cityId) {
    throw new DomainError('pincode_town', `Pincode ${pincode} is in ${pin.city}, not ${town.name}. Check the town or the pincode.`);
  }
  if (localityId) {
    const [l] = await db<{ id: number }[]>`select id from mkt.localities where id = ${localityId} and city_id = ${cityId}`;
    if (!l) localityId = null;
  }
  if (!localityId && pincode) localityId = (await localitiesForPincodes(db, [pincode])).get(pincode)?.id ?? null;
  return { cityId, localityId, pincode };
}

/** Coordinates from a Google Maps or OpenStreetMap link, when the link carries them. */
export function coordsFromMapLink(url: string): { lat: number; lng: number } | null {
  const pats = [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/];
  for (const p of pats) {
    const m = url.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98) return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
    }
  }
  return null;
}

export type VendorPlaceInput = {
  cityId: number | null;
  localityId: number | null;
  pincode: string | null;
  addressLine: string;
  mapsUrl: string;
  addressPublic: boolean;
  serviceCityIds: number[];
};

/** A vendor's own address. Moving town is allowed; the listing follows. */
export async function saveVendorPlace(db: Db, vendorId: string, input: VendorPlaceInput, actor: string) {
  const place = await resolvePlace(db, input);
  const addressLine = input.addressLine.trim().replace(/\s+/g, ' ').slice(0, 200) || null;
  const mapsUrl = input.mapsUrl.trim().slice(0, 500) || null;
  if (mapsUrl && !/^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|www\.openstreetmap\.org)\S*$/i.test(mapsUrl)) {
    throw new DomainError('bad_map', 'Paste a Google Maps link to your place, or leave it blank');
  }
  const coords = mapsUrl ? coordsFromMapLink(mapsUrl) : null;
  const service = [...new Set([place.cityId, ...input.serviceCityIds.filter((n) => Number.isInteger(n) && n > 0)])].slice(0, 30);
  const known = await db<{ id: number }[]>`select id from mkt.cities where id = any(${service}::int[]) and active`;
  await db`
    update mkt.vendors set city_id = ${place.cityId}, locality_id = ${place.localityId}, pincode = ${place.pincode},
      address_line = ${addressLine}, maps_url = ${mapsUrl}, lat = ${coords?.lat ?? null}, lng = ${coords?.lng ?? null},
      address_public = ${input.addressPublic}, service_city_ids = ${known.map((k) => k.id)}, updated_at = now()
    where id = ${vendorId}`;
  await audit(db, actor, 'vendor.place', 'vendor', vendorId, { city: place.cityId, locality: place.localityId, pincode: place.pincode });
  return place;
}

/** What a visitor sees: the full address only when the vendor chose to show it. */
export function publicAddress(v: { address_public?: boolean; address_line?: string | null; locality: string | null; city: string; pincode?: string | null; state?: string | null }) {
  const area = [v.locality, v.city].filter(Boolean).join(', ');
  if (!v.address_public) return { line: area, full: false };
  return { line: [v.address_line, area, v.pincode].filter(Boolean).join(', '), full: true };
}

// ---------------------------------------------------------------- Ops
export async function opsSetTownLaunch(db: Db, cityId: number, launched: boolean, actor: string) {
  await db`update mkt.cities set launched = ${launched}, sort = case when ${launched} and sort >= 1000 then (select coalesce(max(sort), 0) + 1 from mkt.cities where launched) else sort end where id = ${cityId}`;
  await audit(db, actor, launched ? 'town.launch' : 'town.unlaunch', 'city', String(cityId));
}

export async function opsSaveLocality(db: Db, input: { id?: number | null; cityId: number; name: string; kind: string; pincode: string | null; active: boolean }, actor: string) {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) throw new DomainError('name', 'Name the area');
  if (!['sector', 'phase', 'area', 'road', 'village'].includes(input.kind)) throw new DomainError('kind', 'Pick the kind of area');
  const pin = input.pincode?.trim() || null;
  if (pin && !(await pincodeInfo(db, pin))) throw new DomainError('pincode', `Pincode ${pin} is not in the India Post directory`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (input.id) {
    await db`update mkt.localities set name = ${name}, kind = ${input.kind}, pincode = ${pin}, active = ${input.active} where id = ${input.id}`;
  } else {
    const [dup] = await db`select 1 from mkt.localities where city_id = ${input.cityId} and slug = ${slug}`;
    if (dup) throw new DomainError('dup', `${name} is already listed`);
    await db`insert into mkt.localities (city_id, slug, name, kind, pincode, sort, source) values (${input.cityId}, ${slug}, ${name}, ${input.kind}, ${pin}, 100, 'ops')`;
  }
  await audit(db, actor, 'locality.save', 'city', String(input.cityId), { name });
}

/** Ops corrects which town a pincode belongs to; the mapper never overwrites it again. */
export async function opsSetPincodeTown(db: Db, pin: string, cityId: number | null, actor: string) {
  if (!(await pincodeInfo(db, pin))) throw new DomainError('pincode', 'Unknown pincode');
  await db`update mkt.pincodes set city_id = ${cityId}, manual = true where pincode = ${pin}`;
  await audit(db, actor, 'pincode.town', 'pincode', pin, { cityId });
}

/** Towns with live vendors (based there or serving it), most first; optionally one category. */
export async function townsWithVendors(db: Db, categoryId?: number | null) {
  return db<{ id: number; slug: string; name: string; state: string; state_code: string; launched: boolean; vendors: number }[]>`
    select c.id, c.slug, c.name, c.state, c.state_code, c.launched, count(distinct v.id)::int as vendors
    from mkt.vendors v join mkt.cities c on c.id = v.city_id or c.id = any(v.service_city_ids)
    where v.status = 'live' and c.active and (${categoryId ?? null}::int is null or v.category_id = ${categoryId ?? null})
    group by c.id order by count(distinct v.id) desc, c.launched desc, c.name`;
}
