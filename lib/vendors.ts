import type { Db } from './db';
import { DomainError, audit } from './db';
import {
  type Category,
  type CategoryField,
  type City,
  displayValue,
  fieldsFor,
  formatInr,
  slugify,
  validateAttributes,
} from './catalog';

export type Vendor = {
  id: string;
  owner_profile_id: string | null;
  legacy_artist_id: number | null;
  category_id: number;
  city_id: number;
  locality_id: number | null;
  service_city_ids: number[];
  slug: string;
  business_name: string;
  tagline: string;
  about: string;
  starting_price_inr: number | null;
  years_experience: number | null;
  attributes: Record<string, unknown>;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  cover_image_url: string | null;
  status: 'draft' | 'pending_review' | 'live' | 'suspended' | 'closed';
  claim_status: 'claimed' | 'invited' | 'unclaimed';
  verified_at: Date | null;
  assured: boolean;
  known_for?: string[];
  whatsapp_alerts?: boolean;
  legal_name?: string | null;
  billing_address?: string | null;
  gstin?: string | null;
  address_line?: string | null;
  pincode?: string | null;
  maps_url?: string | null;
  lat?: string | null;
  lng?: string | null;
  address_public?: boolean;
  billing_state_code?: string | null;
  billing_pincode?: string | null;
  bookings_per_day?: number;
  calendar_updated_at?: Date | null;
  calendar_token?: string;
  calendar_import_url?: string | null;
  calendar_imported_at?: Date | null;
  calendar_import_error?: string | null;
  created_at: Date;
};

export type VendorCard = Vendor & {
  category_slug: string;
  category_name: string;
  price_unit: string;
  city_name: string;
  city_slug: string;
  state_name?: string;
  locality_name?: string | null;
  locality_slug?: string | null;
  rating: number | null;
  review_count: number;
};

/**
 * Public fields only: contact details never leave the server for brides, and the street address,
 * map and coordinates only when the vendor chose to show them. Billing details never.
 */
export function publicVendor<T extends Vendor>(v: T) {
  const { phone: _p, email: _e, instagram: _i, website: _w, legal_name: _l, billing_address: _b, gstin: _g, billing_state_code: _s, billing_pincode: _bp, calendar_token: _t, calendar_import_url: _iu, calendar_import_error: _ie, ...rest } = v;
  if (!rest.address_public) return { ...rest, address_line: null, maps_url: null, lat: null, lng: null };
  return rest;
}

// ---------------------------------------------------------------- landing-page filters
export type FilterDef = {
  slug: string;
  label: string;
  field: CategoryField;
  value: string | true | { min?: number; max?: number };
};

/** The pseudo-field price-band filters use: they filter on the starting price, not an attribute. */
const PRICE_FIELD: CategoryField = {
  id: 0, category_id: 0, key: '__price', label: 'Starting price', type: 'money', options: [], required: false,
  filterable: true, on_card: false, faq_question: null, seo_slug: null, sort: 0,
  section: null,
};

export function filtersFor(fields: CategoryField[], priceBands: { seo: string; label: string; min?: number; max?: number }[] = []): FilterDef[] {
  const out: FilterDef[] = [];
  for (const f of fields) {
    if (!f.filterable) continue;
    if (f.type === 'bool' && f.seo_slug) out.push({ slug: f.seo_slug, label: f.label, field: f, value: true });
    if (f.type === 'select' || f.type === 'multiselect') {
      for (const o of f.options) if (o.seo) out.push({ slug: o.seo, label: o.label, field: f, value: o.value });
    }
    if (f.type === 'number' || f.type === 'money') {
      for (const o of f.options) if (o.seo) out.push({ slug: o.seo, label: o.label, field: f, value: { min: o.min, max: o.max } });
    }
  }
  for (const b of priceBands) out.push({ slug: b.seo, label: b.label, field: PRICE_FIELD, value: { min: b.min, max: b.max } });
  return out;
}

export type SortKey = 'recommended' | 'price_low' | 'price_high' | 'rating';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_low', label: 'Price: low to high' },
  { key: 'price_high', label: 'Price: high to low' },
  { key: 'rating', label: 'Top rated' },
];

type BrowseOpts = {
  sort?: SortKey;
  /** Leave out for every category. */
  categoryId?: number | null;
  cityId?: number | null;
  filter?: FilterDef | null;
  minRating?: number | null;
  /** Vendors based in this area of the town. */
  localityId?: number | null;
  /** Vendors not booked or closed on this date (YYYY-MM-DD). */
  freeOn?: string | null;
  limit?: number;
  offset?: number;
};

function browseWhere(db: Db, o: Omit<BrowseOpts, 'limit' | 'offset'>) {
  const f = o.filter;
  const filterSql = !f
    ? db``
    : f.value === true
      ? db`and (v.attributes ->> ${f.field.key}) = 'true'`
      : typeof f.value === 'object' && f.field.key === '__price'
        ? db`and v.starting_price_inr is not null
            and (${f.value.min ?? null}::int is null or v.starting_price_inr >= ${f.value.min ?? null}::int)
            and (${f.value.max ?? null}::int is null or v.starting_price_inr <= ${f.value.max ?? null}::int)`
      : typeof f.value === 'object'
        ? db`and (v.attributes ->> ${f.field.key}) ~ '^[0-9]+$'
            and (${f.value.min ?? null}::int is null or (v.attributes ->> ${f.field.key})::int >= ${f.value.min ?? null}::int)
            and (${f.value.max ?? null}::int is null or (v.attributes ->> ${f.field.key})::int <= ${f.value.max ?? null}::int)`
      : f.field.type === 'multiselect'
        ? db`and (v.attributes -> ${f.field.key}) ? ${f.value}`
        : db`and (v.attributes ->> ${f.field.key}) = ${f.value}`;
  const citySql = o.cityId
    ? db`and (v.city_id = ${o.cityId} or ${o.cityId} = any(v.service_city_ids))`
    : db``;
  const ratingSql = o.minRating
    ? db`and (select avg((rating_artist + rating_service) / 2.0) from mkt.reviews where vendor_id = v.id and status = 'published') >= ${o.minRating}`
    : db``;
  const areaSql = o.localityId ? db`and v.locality_id = ${o.localityId}` : db``;
  const freeSql = o.freeOn ? db`and not mkt.vendor_busy(v.id, ${o.freeOn}::date)` : db``;
  const catSql = o.categoryId ? db`and v.category_id = ${o.categoryId}` : db``;
  return db`v.status = 'live' ${catSql} ${citySql} ${filterSql} ${ratingSql} ${areaSql} ${freeSql}`;
}

export async function browseVendors(db: Db, o: BrowseOpts) {
  return db<VendorCard[]>`
    select v.*, c.slug as category_slug, c.name as category_name, c.price_unit,
           ci.name as city_name, ci.slug as city_slug, ci.state as state_name, lo.name as locality_name, lo.slug as locality_slug,
           r.rating, coalesce(r.n, 0)::int as review_count
    from mkt.vendors v
    join mkt.categories c on c.id = v.category_id
    join mkt.cities ci on ci.id = v.city_id
    left join mkt.localities lo on lo.id = v.locality_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published'
    ) r on true
    where ${browseWhere(db, o)}
    order by ${
      o.sort === 'price_low'
        ? db`v.starting_price_inr asc nulls last,`
        : o.sort === 'price_high'
          ? db`v.starting_price_inr desc nulls last,`
          : o.sort === 'rating'
            ? db`r.rating desc nulls last, r.n desc,`
            : db``
    } v.assured desc, (v.verified_at is not null) desc, r.rating desc nulls last, v.created_at
    limit ${o.limit ?? 24} offset ${o.offset ?? 0}`;
}

export async function countVendors(db: Db, o: Omit<BrowseOpts, 'limit' | 'offset'>) {
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.vendors v where ${browseWhere(db, o)}`;
  return n;
}

export async function getVendorBySlug(db: Db, slug: string) {
  const [v] = await db<VendorCard[]>`
    select v.*, c.slug as category_slug, c.name as category_name, c.price_unit,
           ci.name as city_name, ci.slug as city_slug, ci.state as state_name, lo.name as locality_name, lo.slug as locality_slug,
           r.rating, coalesce(r.n, 0)::int as review_count
    from mkt.vendors v
    join mkt.categories c on c.id = v.category_id
    join mkt.cities ci on ci.id = v.city_id
    left join mkt.localities lo on lo.id = v.locality_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published'
    ) r on true
    where v.slug = ${slug}`;
  return v ?? null;
}

export async function vendorMedia(db: Db, vendorId: string) {
  return db<{ id: string; url: string; caption: string; tags: string[] }[]>`
    select id, url, caption, tags from mkt.vendor_media where vendor_id = ${vendorId} order by sort, created_at`;
}

export async function vendorForOwner(db: Db, profileId: string) {
  const [v] = await db<VendorCard[]>`
    select v.*, c.slug as category_slug, c.name as category_name, c.price_unit,
           ci.name as city_name, ci.slug as city_slug, null::float as rating, 0 as review_count
    from mkt.vendors v
    join mkt.categories c on c.id = v.category_id
    join mkt.cities ci on ci.id = v.city_id
    where v.owner_profile_id = ${profileId}
    order by v.created_at limit 1`;
  return v ?? null;
}

/** Questions and answers written from structured fields: cheap SEO and LLM-answer material. */
export function vendorFaq(v: VendorCard, fields: CategoryField[]) {
  const name = v.business_name;
  const faq: { q: string; a: string }[] = [];
  faq.push({ q: `Where is ${name} based?`, a: `${name} is based in ${v.city_name}.` });
  if (v.starting_price_inr != null) {
    faq.push({
      q: `What does ${name} charge?`,
      a: `${name}'s prices start at ${formatInr(v.starting_price_inr)} ${v.price_unit}. Final quotes depend on your dates and requirements.`,
    });
  }
  for (const f of fields) {
    if (!f.faq_question) continue;
    const shown = displayValue(f, v.attributes[f.key]);
    if (shown == null) continue;
    const q = f.faq_question.replaceAll('{name}', name);
    const a =
      f.type === 'bool'
        ? // Policies ("Alcohol allowed", "On rent") read as a plain yes/no; services read as offers.
          /allowed|rent|order|certified|in-house|travels/i.test(f.label)
          ? `${v.attributes[f.key] ? 'Yes' : 'No'}. ${f.label}: ${v.attributes[f.key] ? 'yes' : 'no'}.`
          : `${shown}. ${name} ${v.attributes[f.key] ? 'offers' : 'does not offer'} ${f.label.toLowerCase()}.`
        : `${f.label}: ${shown}.`;
    faq.push({ q, a });
  }
  if (v.years_experience) {
    faq.push({ q: `How experienced is ${name}?`, a: `${name} has ${v.years_experience} years of experience.` });
  }
  return faq;
}

// ---------------------------------------------------------------- writes
export type VendorInput = {
  business_name: string;
  category_id: number;
  city_id: number;
  tagline?: string;
  about?: string;
  starting_price_inr?: number | null;
  years_experience?: number | null;
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  website?: string | null;
  cover_image_url?: string | null;
  attributes: Record<string, unknown>;
};

async function uniqueSlug(db: Db, base: string) {
  const root = slugify(base) || 'vendor';
  let slug = root;
  for (let i = 2; i < 200; i++) {
    const [hit] = await db`select 1 from mkt.vendors where slug = ${slug}`;
    if (!hit) return slug;
    slug = `${root}-${i}`;
  }
  throw new DomainError('slug_taken', 'Could not find a free URL for this vendor');
}

export async function createVendor(
  db: Db,
  input: VendorInput,
  opts: { ownerProfileId: string | null; actor: string | null; claimStatus?: Vendor['claim_status'] }
) {
  const fields = await fieldsFor(db, input.category_id);
  const attributes = validateAttributes(fields, input.attributes);
  const [city] = await db<City[]>`select * from mkt.cities where id = ${input.city_id}`;
  if (!city) throw new DomainError('bad_city', 'Unknown city');
  const slug = await uniqueSlug(db, `${input.business_name} ${city.name}`);
  const [v] = await db<Vendor[]>`
    insert into mkt.vendors (owner_profile_id, category_id, city_id, service_city_ids, slug, business_name,
      tagline, about, starting_price_inr, years_experience, attributes, phone, email, instagram, website,
      cover_image_url, status, claim_status)
    values (${opts.ownerProfileId}, ${input.category_id}, ${input.city_id}, ${[input.city_id]}, ${slug},
      ${input.business_name.trim()}, ${input.tagline ?? ''}, ${input.about ?? ''}, ${input.starting_price_inr ?? null},
      ${input.years_experience ?? null}, ${db.json(attributes as never)}, ${input.phone ?? null},
      ${input.email ?? null}, ${input.instagram ?? null}, ${input.website ?? null}, ${input.cover_image_url ?? null},
      ${opts.ownerProfileId ? 'pending_review' : 'draft'}, ${opts.claimStatus ?? (opts.ownerProfileId ? 'claimed' : 'unclaimed')})
    returning *`;
  await audit(db, opts.actor, 'vendor.create', 'vendor', v.id, { slug });
  if (v.status === 'pending_review') await (await import('./alerts')).staffAlert(db, 'profile', v.business_name, `/ops/vendors/${v.id}`, `profile:${v.id}`);
  return v;
}

export async function updateVendorProfile(
  db: Db,
  vendorId: string,
  input: Omit<VendorInput, 'category_id' | 'city_id'>,
  actor: string
) {
  const [v] = await db<Vendor[]>`select * from mkt.vendors where id = ${vendorId}`;
  if (!v) throw new DomainError('not_found', 'Vendor not found');
  const fields = await fieldsFor(db, v.category_id);
  const attributes = validateAttributes(fields, input.attributes);
  const [u] = await db<Vendor[]>`
    update mkt.vendors set
      business_name = ${input.business_name.trim()}, tagline = ${input.tagline ?? ''}, about = ${input.about ?? ''},
      starting_price_inr = ${input.starting_price_inr ?? null}, years_experience = ${input.years_experience ?? null},
      attributes = ${db.json(attributes as never)}, phone = ${input.phone ?? null}, email = ${input.email ?? null},
      instagram = ${input.instagram ?? null}, website = ${input.website ?? null},
      cover_image_url = ${input.cover_image_url ?? null},
      status = case when status = 'draft' then 'pending_review' else status end,
      updated_at = now()
    where id = ${vendorId} returning *`;
  await audit(db, actor, 'vendor.update', 'vendor', vendorId);
  if (v.status === 'draft' && u.status === 'pending_review') await (await import('./alerts')).staffAlert(db, 'profile', u.business_name, `/ops/vendors/${vendorId}`, `profile:${vendorId}:${new Date().toISOString().slice(0, 10)}`);
  return u;
}

export async function setVendorStatus(
  db: Db,
  vendorId: string,
  change: { status?: Vendor['status']; verified?: boolean; assured?: boolean; serviceCityIds?: number[] },
  actor: string
) {
  const [before] = await db<{ status: string }[]>`select status from mkt.vendors where id = ${vendorId}`;
  if (change.status === 'live') {
    const [v] = await db<{ claim_status: string }[]>`select claim_status from mkt.vendors where id = ${vendorId}`;
    if (!v) throw new DomainError('not_found', 'Vendor not found');
    if (v.claim_status !== 'claimed') {
      throw new DomainError('not_claimed', 'A profile goes live only after the vendor has claimed it');
    }
  }
  await db`
    update mkt.vendors set
      status = coalesce(${change.status ?? null}, status),
      verified_at = case
        when ${change.verified ?? null}::boolean is true then coalesce(verified_at, now())
        when ${change.verified ?? null}::boolean is false then null
        else verified_at end,
      assured = coalesce(${change.assured ?? null}, assured),
      service_city_ids = coalesce(${change.serviceCityIds ?? null}::int[], service_city_ids),
      updated_at = now()
    where id = ${vendorId}`;
  await audit(db, actor, 'vendor.status', 'vendor', vendorId, change);
  await (await import('./alerts')).alertVendorStatus(db, vendorId, before?.status ?? null, change.status ?? null);
}

/** Ops invites a vendor to claim a profile Ops built. Nothing is published until claimed. */
export async function inviteClaim(db: Db, vendorId: string, email: string, actor: string) {
  const [c] = await db<{ id: string; token: string }[]>`
    insert into mkt.vendor_claims (vendor_id, invite_email) values (${vendorId}, ${email.toLowerCase()})
    returning id, token`;
  await db`update mkt.vendors set claim_status = 'invited' where id = ${vendorId}`;
  await audit(db, actor, 'vendor.claim_invite', 'vendor', vendorId, { email });
  return c;
}

export async function acceptClaim(db: Db, token: string, profileId: string) {
  const [c] = await db<{ id: string; vendor_id: string; status: string }[]>`
    select id, vendor_id, status from mkt.vendor_claims where token = ${token}`;
  if (!c || c.status !== 'invited') throw new DomainError('bad_claim', 'This claim link is not valid any more');
  await db`update mkt.vendor_claims set status = 'submitted', profile_id = ${profileId} where id = ${c.id}`;
  await (await import('./alerts')).staffAlert(db, 'claim', 'A vendor claimed their profile', '/ops/vendors', `claim:${c.id}`);
  return c;
}

export async function decideClaim(db: Db, claimId: string, approve: boolean, actor: string) {
  const [c] = await db<{ vendor_id: string; profile_id: string | null; status: string }[]>`
    select vendor_id, profile_id, status from mkt.vendor_claims where id = ${claimId}`;
  if (!c || c.status !== 'submitted') throw new DomainError('bad_claim', 'Nothing to decide on this claim');
  await db`
    update mkt.vendor_claims set status = ${approve ? 'approved' : 'rejected'}, decided_by = ${actor}, decided_at = now()
    where id = ${claimId}`;
  if (approve) {
    await db`update mkt.profiles set role = 'vendor' where id = ${c.profile_id} and role = 'bride'`;
    await db`
      update mkt.vendors set owner_profile_id = ${c.profile_id}, claim_status = 'claimed',
        status = case when status = 'draft' then 'pending_review' else status end
      where id = ${c.vendor_id}`;
  } else {
    await db`update mkt.vendors set claim_status = 'unclaimed' where id = ${c.vendor_id}`;
  }
  await audit(db, actor, approve ? 'vendor.claim_approved' : 'vendor.claim_rejected', 'vendor', c.vendor_id);
  await (await import('./alerts')).alertClaimDecided(db, claimId, approve);
}

export function isPubliclyVisible(v: Pick<Vendor, 'status'>) {
  return v.status === 'live';
}

export type { Category };

/** Vendors like this one: same category, serving the same city, best rated first. */
export async function similarVendors(db: Db, v: { id: string; category_id: number; city_id: number }, limit = 4) {
  return browseVendors(db, { categoryId: v.category_id, cityId: v.city_id, sort: 'rating', limit: limit + 1 }).then((r) =>
    r.filter((x) => x.id !== v.id).slice(0, limit)
  );
}

/** Families who started a request to this vendor or asked for them by name in the last 7 days. */
export async function recentDemand(db: Db, vendorId: string) {
  const [{ n }] = await db<{ n: number }[]>`
    select (
      coalesce((select sum(quote_starts) from mkt.vendor_daily where vendor_id = ${vendorId} and day > (now() at time zone 'Asia/Kolkata')::date - 7), 0)
      + (select count(*) from mkt.lead_needs where direct_vendor_id = ${vendorId} and created_at > now() - interval '7 days')
    )::int as n`;
  return n;
}
