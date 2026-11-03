import Link from 'next/link';
import { after } from 'next/server';
import { bump, visitorKey } from '@/lib/analytics';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { fieldsFor, getCategoryBySlug, getCityBySlug, listCities } from '@/lib/catalog';
import { localitiesFor, localityBySlug } from '@/lib/locations';
import { SORTS, type SortKey, browseVendors, countVendors, filtersFor } from '@/lib/vendors';
import { currentProfile } from '@/lib/auth';
import { shortlistedIds } from '@/lib/weddings';
import { breadcrumbLd, faqLd, indexable, itemListLd, landingFaq, landingPath, landingTitle } from '@/lib/seo';
import { Container, Empty, PageTitle } from './ui';
import { publishedCollections } from '@/lib/collections';
import { costGuide, costPath } from '@/lib/costGuide';
import { formatInr } from '@/lib/catalog';
import { JsonLd, VendorCard } from './VendorCard';
import { sponsored } from '@/lib/promotion';
import { RememberTown } from './RememberTown';
import { calendarFreshDays, freshness, shortDate, todayIst } from '@/lib/availability';

export const PAGE_SIZE = 24;

export async function resolveLanding(citySlug: string, categorySlug: string, filterSlug?: string, page = 1, sort: SortKey = 'recommended', minRating: number | null = null, freeOn: string | null = null) {
  const [city, category] = await Promise.all([getCityBySlug(sql, citySlug), getCategoryBySlug(sql, categorySlug)]);
  if (!city || !category || !category.active) return null;
  const fields = await fieldsFor(sql, category.id);
  const filters = filtersFor(fields, category.price_bands ?? []);
  const filter = filterSlug ? (filters.find((f) => f.slug === filterSlug) ?? null) : null;
  // The third segment is a filter ("airbrush") or else an area of the town ("sector-35", "vip-road").
  const area = filterSlug && !filter ? await localityBySlug(sql, city.id, filterSlug) : null;
  if (filterSlug && !filter && !area) return null;
  const localityId = area?.id ?? null;
  const [vendors, total] = await Promise.all([
    browseVendors(sql, { categoryId: category.id, cityId: city.id, filter, localityId, freeOn, sort, minRating, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countVendors(sql, { categoryId: category.id, cityId: city.id, filter, localityId, freeOn, minRating }),
  ]);
  // Titles and FAQs name the area with its town: "Wedding venues in Sector 35, Chandigarh".
  const place = area ? { ...city, name: `${area.name}, ${city.name}` } : city;
  return { city, place, area, category, fields, filters, filter, vendors, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function landingMetadata(citySlug: string, categorySlug: string, filterSlug?: string, page = 1): Promise<Metadata> {
  const r = await resolveLanding(citySlug, categorySlug, filterSlug, page);
  if (!r) return { title: 'Not found', robots: { index: false } };
  const title = landingTitle(r.category, r.place, r.filter);
  const index = await indexable(sql, r.total);
  const path = landingPath(r.city, r.category, r.filter ?? r.area);
  return {
    title: `${r.total >= 3 ? `Best ${title.charAt(0).toLowerCase()}${title.slice(1)}` : title} with prices, photos and reviews${page > 1 ? ` (page ${page})` : ''}`,
    description: `Compare ${r.total} ${title.toLowerCase()} on OLReady. See starting prices, verified profiles and reviews, then get quotes from verified vendors.`,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    robots: index ? undefined : { index: false, follow: true },
  };
}

export async function ListingPage({
  citySlug,
  categorySlug,
  filterSlug,
  page = 1,
  sort = 'recommended',
  minRating = null,
  freeOn = null,
}: {
  citySlug: string;
  categorySlug: string;
  filterSlug?: string;
  page?: number;
  sort?: SortKey;
  minRating?: number | null;
  freeOn?: string | null;
}) {
  const r = await resolveLanding(citySlug, categorySlug, filterSlug, page, sort, minRating, freeOn);
  if (!r || (page > 1 && page > r.pages)) notFound();
  const { city, place, area, category, fields, filters, filter, vendors, total, pages } = r;
  const here = landingPath(city, category, filter ?? area);
  const viewer = await currentProfile();
  if (vendors.length && (await visitorKey())) after(() => bump(sql, vendors.map((v) => v.id), 'impressions').catch(() => undefined));
  const hearts = await shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null);
  // With a date, say which vendors' calendars show them free that day (only fresh calendars).
  const freshDays = freeOn ? await calendarFreshDays(sql) : 0;
  const notes = new Map<string, string>();
  if (freeOn && vendors.length) {
    const rows = await sql<{ id: string; status: string; updated: Date | null }[]>`
      select v.id, mkt.vendor_day(v.id, ${freeOn}::date) as status, v.calendar_updated_at as updated from mkt.vendors v where v.id = any(${vendors.map((v) => v.id)}::uuid[])`;
    for (const r of rows) if (freshness(r.updated, freshDays).fresh && (r.status === 'free' || r.status === 'some')) notes.set(r.id, `Free on ${shortDate(freeOn)}`);
  }
  const withSort = (path: string, p = 1, rating: number | null = minRating) => {
    const q = new URLSearchParams();
    if (sort !== 'recommended') q.set('sort', sort);
    if (rating) q.set('rating', String(rating));
    if (freeOn) q.set('date', freeOn);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const selfPath = withSort(here, page);
  const withSortNoDate = (path: string) => {
    const q = new URLSearchParams();
    if (sort !== 'recommended') q.set('sort', sort);
    if (minRating) q.set('rating', String(minRating));
    return q.toString() ? `${path}?${q}` : path;
  };
  const title = landingTitle(category, place, filter);
  const faq = landingFaq(category, place, vendors, filter);
  const [launched, areas] = await Promise.all([listCities(sql), localitiesFor(sql, city.id, { withVendorsOnly: true, categoryId: category.id })]);
  const otherCities = launched.filter((c) => c.id !== city.id);
  const [collections, guide] = await Promise.all([publishedCollections(sql, { categoryId: category.id }), costGuide(sql, category.slug, city.slug)]);
  // Sponsored cards sit above the results on the first page only; they never reorder the results.
  const boosted = page === 1 && !filter && !area ? await sponsored(sql, { categoryId: category.id, cityId: city.id, placement: 'search', limit: 2 }) : [];
  // A date filter applies to sponsored cards too: a vendor booked that day is not shown.
  const busy = freeOn && boosted.length
    ? new Set((await sql<{ id: string }[]>`select id from mkt.vendors where id = any(${boosted.map((b) => b.id)}::uuid[]) and mkt.vendor_busy(id, ${freeOn}::date)`).map((r) => r.id))
    : new Set<string>();
  const promoted = boosted.filter((b) => !busy.has(b.id));
  const crumbs = [
    { name: 'Vendors', path: '/vendors' },
    { name: city.name, path: `/vendors/${city.slug}` },
    { name: category.plural_name, path: landingPath(city, category) },
    ...(filter ? [{ name: filter.label, path: landingPath(city, category, filter) }] : []),
    ...(area ? [{ name: area.name, path: landingPath(city, category, area) }] : []),
  ];
  return (
    <Container>
      <JsonLd data={[breadcrumbLd(crumbs), itemListLd(vendors), faqLd(faq)]} />
      <RememberTown slug={city.slug} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        {crumbs.map((c, i) => (
          <span key={c.path}>
            {i ? ' / ' : ''}
            {i === crumbs.length - 1 ? c.name : <Link href={c.path}>{c.name}</Link>}
          </span>
        ))}
      </nav>
      <PageTitle
        title={title}
        sub={
          <>
            <span className="figure text-lg text-[var(--color-ink)]">{total}</span> {total === 1 ? 'vendor' : 'vendors'}, prices{' '}
            {category.price_unit}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/me/assistant?category=${category.slug}&city=${city.slug}`} className="btn btn-ghost">
              Help me choose
            </Link>
            <Link href={`/enquire?category=${category.slug}&city=${city.slug}`} className="btn btn-pink">
              Get verified quotes
            </Link>
          </div>
        }
      />
      <div className="sticky top-[6.5rem] z-10 -mx-4 mb-5 border-y border-[var(--color-line)] bg-white/95 px-4 py-2.5 backdrop-blur md:top-16">
        {filters.length ? (
          <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Filter">
            <Link href={withSort(landingPath(city, category))} className="chip" aria-current={!filter}>
              All
            </Link>
            {filters
              .filter((f) => f.field.key !== '__price')
              .map((f) => (
                <Link key={f.slug} href={withSort(landingPath(city, category, f))} className="chip" aria-current={filter?.slug === f.slug}>
                  {f.label}
                </Link>
              ))}
            {filters.some((f) => f.field.key === '__price') ? <span className="self-center whitespace-nowrap pl-2 text-sm text-[var(--color-muted)]">Price</span> : null}
            {filters
              .filter((f) => f.field.key === '__price')
              .map((f) => (
                <Link key={f.slug} href={withSort(landingPath(city, category, f))} className="chip" aria-current={filter?.slug === f.slug}>
                  {f.label}
                </Link>
              ))}
          </div>
        ) : null}
        {areas.length > 1 || area ? (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto text-sm" role="group" aria-label="Area">
            <span className="self-center whitespace-nowrap text-[var(--color-muted)]">Area</span>
            {area ? (
              <Link href={withSort(landingPath(city, category))} className="chip shrink-0 py-0.5">
                All of {city.name}
              </Link>
            ) : null}
            {areas.slice(0, 15).map((a) => (
              <Link key={a.id} href={withSort(landingPath(city, category, a))} className="chip shrink-0 py-0.5" aria-current={area?.id === a.id}>
                {a.name}
              </Link>
            ))}
          </div>
        ) : null}
        <form action={here} method="get" className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-label="Free on a date">
          {sort !== 'recommended' ? <input type="hidden" name="sort" value={sort} /> : null}
          {minRating ? <input type="hidden" name="rating" value={minRating} /> : null}
          <label htmlFor="free-on" className="text-[var(--color-muted)]">
            Free on
          </label>
          <input id="free-on" name="date" type="date" defaultValue={freeOn ?? ''} min={todayIst()} className="input w-auto py-1 text-sm" />
          <button className="btn btn-ghost btn-sm">Apply</button>
          {freeOn ? (
            <Link href={withSortNoDate(here)} className="chip py-0.5" aria-label={`Clear date ${shortDate(freeOn)}`}>
              {shortDate(freeOn)} ×
            </Link>
          ) : null}
        </form>
        <div className="no-scrollbar mt-2 flex items-center gap-3 overflow-x-auto text-sm" role="group" aria-label="Sort">
          <Link
            href={withSort(here, 1, minRating ? null : 4)}
            className="chip shrink-0 py-0.5"
            aria-current={Boolean(minRating)}
            rel="nofollow"
          >
            ★ 4+ rated
          </Link>
          <span className="text-[var(--color-muted)]">Sort</span>
          {SORTS.map((s) => {
            const q = new URLSearchParams();
            if (s.key !== 'recommended') q.set('sort', s.key);
            if (minRating) q.set('rating', String(minRating));
            if (freeOn) q.set('date', freeOn);
            return (
              <Link
                key={s.key}
                href={here + (q.toString() ? `?${q}` : '')}
                aria-current={sort === s.key}
                className={`whitespace-nowrap ${sort === s.key ? 'font-semibold text-[var(--color-pink-deep)]' : 'text-[var(--color-ink)]'}`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
      {promoted.length ? (
        <div className="mb-8 grid gap-x-5 gap-y-8 rounded-[18px] bg-[var(--color-tint)] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {promoted.map((v) => (
            <VendorCard key={v.boost_id} v={v} fields={fields} backPath={selfPath} shortlisted={hearts.has(v.id)} sponsored={{ boostId: v.boost_id, placement: 'search' }} />
          ))}
        </div>
      ) : null}
      {vendors.length ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vendors.map((v) => (
            <VendorCard key={v.id} v={v} fields={fields} backPath={selfPath} shortlisted={hearts.has(v.id)} dateNote={notes.get(v.id)} />
          ))}
        </div>
      ) : (
        <Empty title={`No ${title.toLowerCase()} listed yet`}>
          Tell us what you need and our team will find verified vendors for you.{' '}
          <Link className="underline" href={`/enquire?category=${category.slug}&city=${city.slug}`}>
            Get quotes
          </Link>
        </Empty>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link rel="prev" href={withSort(here, page - 1)} className="btn btn-ghost btn-sm">
              Previous
            </Link>
          ) : null}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link rel="next" href={withSort(here, page + 1)} className="btn btn-ghost btn-sm">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
      <section className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="font-semibold text-xl">Questions about {title.toLowerCase()}</h2>
          <dl className="mt-3 space-y-3">
            {faq.map((f) => (
              <div key={f.q} className="border-b border-[var(--color-line)] pb-3">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 text-sm text-[var(--color-muted)]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          {guide?.indexable ? (
            <Link href={costPath(category.slug, city.slug)} className="mb-6 block rounded-2xl bg-[var(--color-pink-soft)] p-4 hover:bg-[var(--color-tint)]">
              <span className="block text-sm text-[var(--color-muted)]">Price guide</span>
              <span className="font-semibold">
                What {category.plural_name.toLowerCase()} cost in {city.name}
              </span>
              <span className="mt-1 block text-sm">
                Most start between {formatInr(guide.low)} and {formatInr(guide.high)} {category.price_unit}.
              </span>
            </Link>
          ) : null}
          {collections.length ? (
            <>
              <h2 className="font-semibold text-xl">Hand-picked lists</h2>
              <ul className="mb-6 mt-3 space-y-1 text-sm">
                {collections.map((c) => (
                  <li key={c.id}>
                    <Link className="underline-offset-4 hover:underline" href={`/collections/${c.slug}`}>
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h2 className="font-semibold text-xl">Nearby</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {otherCities.map((c) => (
              <li key={c.slug}>
                <Link className="underline-offset-4 hover:underline" href={landingPath(c, category, filter)}>
                  {landingTitle(category, c, filter)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Container>
  );
}
