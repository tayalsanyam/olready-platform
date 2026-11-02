import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { fieldsFor, getCategoryBySlug, getCityBySlug, listCities } from '@/lib/catalog';
import { SORTS, type SortKey, browseVendors, countVendors, filtersFor } from '@/lib/vendors';
import { currentProfile } from '@/lib/auth';
import { shortlistedIds } from '@/lib/weddings';
import { breadcrumbLd, faqLd, indexable, itemListLd, landingFaq, landingPath, landingTitle } from '@/lib/seo';
import { Container, Empty, PageTitle } from './ui';
import { JsonLd, VendorCard } from './VendorCard';

export const PAGE_SIZE = 24;

export async function resolveLanding(citySlug: string, categorySlug: string, filterSlug?: string, page = 1, sort: SortKey = 'recommended') {
  const [city, category] = await Promise.all([getCityBySlug(sql, citySlug), getCategoryBySlug(sql, categorySlug)]);
  if (!city || !category || !category.active) return null;
  const fields = await fieldsFor(sql, category.id);
  const filters = filtersFor(fields);
  const filter = filterSlug ? (filters.find((f) => f.slug === filterSlug) ?? null) : null;
  if (filterSlug && !filter) return null;
  const [vendors, total] = await Promise.all([
    browseVendors(sql, { categoryId: category.id, cityId: city.id, filter, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countVendors(sql, { categoryId: category.id, cityId: city.id, filter }),
  ]);
  return { city, category, fields, filters, filter, vendors, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function landingMetadata(citySlug: string, categorySlug: string, filterSlug?: string, page = 1): Promise<Metadata> {
  const r = await resolveLanding(citySlug, categorySlug, filterSlug, page);
  if (!r) return { title: 'Not found', robots: { index: false } };
  const title = landingTitle(r.category, r.city, r.filter);
  const index = await indexable(sql, r.total);
  const path = landingPath(r.city, r.category, r.filter);
  return {
    title: `${title}: prices and reviews${page > 1 ? ` (page ${page})` : ''}`,
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
}: {
  citySlug: string;
  categorySlug: string;
  filterSlug?: string;
  page?: number;
  sort?: SortKey;
}) {
  const r = await resolveLanding(citySlug, categorySlug, filterSlug, page, sort);
  if (!r || (page > 1 && page > r.pages)) notFound();
  const { city, category, fields, filters, filter, vendors, total, pages } = r;
  const here = landingPath(city, category, filter);
  const viewer = await currentProfile();
  const hearts = await shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null);
  const withSort = (path: string, p = 1) => {
    const q = new URLSearchParams();
    if (sort !== 'recommended') q.set('sort', sort);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const selfPath = withSort(here, page);
  const title = landingTitle(category, city, filter);
  const faq = landingFaq(category, city, vendors, filter);
  const otherCities = (await listCities(sql)).filter((c) => c.id !== city.id);
  const crumbs = [
    { name: 'Vendors', path: '/vendors' },
    { name: city.name, path: `/vendors/${city.slug}` },
    { name: category.plural_name, path: landingPath(city, category) },
    ...(filter ? [{ name: filter.label, path: landingPath(city, category, filter) }] : []),
  ];
  return (
    <Container>
      <JsonLd data={[breadcrumbLd(crumbs), itemListLd(vendors), faqLd(faq)]} />
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
          <Link href={`/enquire?category=${category.slug}&city=${city.slug}`} className="btn btn-pink">
            Get verified quotes
          </Link>
        }
      />
      <div className="sticky top-[6.5rem] z-10 -mx-4 mb-5 border-y border-[var(--color-line)] bg-white/95 px-4 py-2.5 backdrop-blur md:top-16">
        {filters.length ? (
          <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Filter">
            <Link href={withSort(landingPath(city, category))} className="chip" aria-current={!filter}>
              All
            </Link>
            {filters.map((f) => (
              <Link key={f.slug} href={withSort(landingPath(city, category, f))} className="chip" aria-current={filter?.slug === f.slug}>
                {f.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="no-scrollbar mt-2 flex items-center gap-3 overflow-x-auto text-sm" role="group" aria-label="Sort">
          <span className="text-[var(--color-muted)]">Sort</span>
          {SORTS.map((s) => {
            const q = s.key === 'recommended' ? '' : `?sort=${s.key}`;
            return (
              <Link
                key={s.key}
                href={here + q}
                aria-current={sort === s.key}
                className={`whitespace-nowrap ${sort === s.key ? 'font-semibold text-[var(--color-pink-deep)]' : 'text-[var(--color-ink)]'}`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
      {vendors.length ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vendors.map((v) => (
            <VendorCard key={v.id} v={v} fields={fields} backPath={selfPath} shortlisted={hearts.has(v.id)} />
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
