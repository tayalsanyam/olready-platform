import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatInr, listCities } from '@/lib/catalog';
import { searchArticles, searchIdeaTopics, searchPages, searchRealWeddings, searchVendors } from '@/lib/search';
import { Container, Cover, Empty, PageTitle, Stars, sp } from '@/components/ui';
import { SearchBox } from '@/components/SearchBox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search', robots: { index: false, follow: true } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const TYPES = [
  ['all', 'All'],
  ['vendors', 'Vendors'],
  ['ideas', 'Ideas'],
  ['guides', 'Guides'],
  ['weddings', 'Real weddings'],
] as const;

export default async function Search({ searchParams }: P) {
  const p = await searchParams;
  const q = (sp(p.q) ?? '').trim().slice(0, 60);
  const type = TYPES.find(([k]) => k === sp(p.type))?.[0] ?? 'all';
  const cities = await listCities(sql);
  const city = cities.find((c) => c.slug === sp(p.city)) ?? null;
  const want = (t: string) => type === 'all' || type === t;
  const [vendors, pages, articles, ideas, weddings] = q.length >= 2
    ? await Promise.all([
        want('vendors') ? searchVendors(sql, q, city?.id ?? null, 48) : [],
        want('vendors') ? searchPages(sql, q, city ?? cities[0]) : [],
        want('guides') ? searchArticles(sql, q) : [],
        want('ideas') ? searchIdeaTopics(sql, q) : [],
        want('weddings') ? searchRealWeddings(sql, q) : [],
      ])
    : [[], [], [], [], []];
  const total = vendors.length + pages.length + articles.length + ideas.length + weddings.length;
  const href = (t: string) => `/search?q=${encodeURIComponent(q)}${city ? `&city=${city.slug}` : ''}${t === 'all' ? '' : `&type=${t}`}`;
  return (
    <Container>
      <PageTitle title={q ? `Results for “${q}”` : 'Search'} sub={city ? `In ${city.name} and vendors who serve it` : 'Across Chandigarh, Mohali, Panchkula and nearby'} />
      <div className="mb-4 max-w-2xl">
        <SearchBox cities={cities.map((c) => ({ slug: c.slug, name: c.name }))} defaultCity={city?.slug ?? ''} />
      </div>
      {q ? (
        <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Show">
          {TYPES.map(([k, label]) => (
            <Link key={k} href={href(k)} className="chip" aria-current={type === k}>
              {label}
            </Link>
          ))}
        </div>
      ) : null}
      {q.length < 2 ? (
        <Empty title="Type at least two letters">Try a vendor&apos;s name, “banquet”, “airbrush”, “lehenga” or “mehendi”.</Empty>
      ) : !total ? (
        <Empty title={`Nothing found for “${q}”`}>
          Try a shorter word, another city, or <Link className="underline" href="/enquire">tell us what you need</Link> and our team will find verified vendors.
        </Empty>
      ) : (
        <div className="space-y-10">
          {pages.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Browse</h2>
              <ul className="flex flex-wrap gap-2">
                {pages.map((x) => (
                  <li key={x.href}>
                    <Link href={x.href} className="chip">
                      {x.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {vendors.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Vendors ({vendors.length})</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vendors.map((v) => (
                  <li key={v.slug}>
                    <Link href={`/v/${v.slug}`} className="group flex gap-3">
                      <span className="block h-20 w-24 shrink-0 overflow-hidden rounded-[10px]">
                        <Cover url={v.cover_image_url} name={v.business_name} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:text-[var(--color-pink-deep)]">{v.business_name}</span>
                        <span className="block text-sm text-[var(--color-muted)]">
                          {v.category_name}, {v.city_name}
                        </span>
                        {v.review_count ? <Stars value={v.rating} count={v.review_count} /> : null}
                        <span className="block text-sm">{v.starting_price_inr != null ? `${formatInr(v.starting_price_inr)} ${v.price_unit}` : 'Price on request'}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {ideas.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Ideas</h2>
              <ul className="flex flex-wrap gap-2">
                {ideas.map((x) => (
                  <li key={x.href}>
                    <Link href={x.href} className="chip">
                      {x.label.replace(/^(\w)/, (m) => m.toUpperCase())}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {articles.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Guides</h2>
              <ul className="space-y-3">
                {articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/blog/${a.slug}`} className="font-semibold hover:text-[var(--color-pink-deep)]">
                      {a.title}
                    </Link>
                    <p className="text-sm text-[var(--color-muted)]">{a.excerpt}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {weddings.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Real weddings</h2>
              <ul className="space-y-2">
                {weddings.map((w) => (
                  <li key={w.slug}>
                    <Link href={`/real-weddings/${w.slug}`} className="font-semibold hover:text-[var(--color-pink-deep)]">
                      {w.couple_names}
                    </Link>{' '}
                    <span className="text-sm text-[var(--color-muted)]">{w.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Container>
  );
}
