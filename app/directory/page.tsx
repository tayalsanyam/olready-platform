import Link from 'next/link';
import { sql } from '@/lib/db';
import { landingEntries } from '@/lib/seo';
import { costEntries } from '@/lib/costGuide';
import { listCities } from '@/lib/catalog';
import { ideaTopics } from '@/lib/ideas';
import { publishedCollections } from '@/lib/collections';
import { SECTIONS } from '@/lib/articles';
import { Container } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All wedding vendor pages',
  description: 'Every OLReady page for wedding vendors, prices and ideas in Chandigarh, Mohali, Panchkula and nearby towns, in one place.',
  alternates: { canonical: '/directory' },
};

/** A browsable map of every public page, by town, then prices and ideas. */
export default async function Directory() {
  const [landing, costs, cities, topics, collections] = await Promise.all([landingEntries(sql), costEntries(sql), listCities(sql), ideaTopics(sql), publishedCollections(sql)]);
  const byCity = cities
    .map((c) => ({
      city: c,
      pages: landing.filter((l) => l.path.startsWith(`/vendors/${c.slug}/`)),
    }))
    .filter((x) => x.pages.length);
  return (
    <Container className="max-w-6xl">
      <h1 className="text-3xl font-semibold">All wedding vendor pages</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-muted)]">Every town, category and price guide on OLReady. Pages appear here once enough vendors are listed to make them useful.</p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Vendors by town</h2>
        <div className="mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {byCity.map(({ city, pages }) => (
            <div key={city.slug}>
              <h3 className="font-semibold">
                <Link href={`/vendors/${city.slug}`} className="hover:text-[var(--color-pink-deep)]">
                  {city.name}
                </Link>
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {pages
                  .filter((p) => p.path.split('/').length === 4)
                  .map((p) => (
                    <li key={p.path}>
                      <Link href={p.path} className="hover:text-[var(--color-pink-deep)]">
                        {p.title}
                      </Link>{' '}
                      <span className="text-[var(--color-muted)]">{p.vendors}</span>
                      {pages.some((x) => x.path.startsWith(p.path + '/')) ? (
                        <ul className="mb-1 ml-3 mt-1 space-y-0.5 text-[13px] text-[var(--color-muted)]">
                          {pages
                            .filter((x) => x.path.startsWith(p.path + '/'))
                            .map((x) => (
                              <li key={x.path}>
                                <Link href={x.path} className="hover:text-[var(--color-ink)]">
                                  {x.title}
                                </Link>
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {costs.length ? (
        <section className="mt-12 scroll-mt-24" id="costs">
          <h2 className="text-xl font-semibold">Wedding costs</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {costs.map((c) => (
              <li key={c.path}>
                <Link href={c.path} className="hover:text-[var(--color-pink-deep)]">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h2 className="font-semibold">Ideas</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {topics
              .filter((t) => t.photo_count > 0)
              .map((t) => (
                <li key={t.slug}>
                  <Link href={`/ideas/${t.slug}`} className="hover:text-[var(--color-pink-deep)]">
                    {t.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">Guides</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(SECTIONS).map(([k, s]) => (
              <li key={k}>
                <Link href={`/blog/section/${k}`} className="hover:text-[var(--color-pink-deep)]">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">Hand-picked lists</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {collections.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} className="hover:text-[var(--color-pink-deep)]">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">More</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {[
              ['/real-weddings', 'Real weddings'],
              ['/invitations', 'Wedding invitation designs'],
              ['/look', 'Search by photo'],
              ['/for-vendors', 'List your business'],
              ['/about', 'About OLReady'],
              ['/contact', 'Contact'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="hover:text-[var(--color-pink-deep)]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Container>
  );
}
