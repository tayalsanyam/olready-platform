import Link from 'next/link';
import { sql } from '@/lib/db';
import { landingEntries } from '@/lib/seo';
import { costEntries } from '@/lib/costGuide';
import { townsWithVendors } from '@/lib/locations';
import { ideaTopics } from '@/lib/ideas';
import { publishedCollections } from '@/lib/collections';
import { SECTIONS } from '@/lib/articles';
import { Container } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All wedding vendor pages',
  description: 'Every Olready page for wedding vendors, prices and ideas across India, in one place.',
  alternates: { canonical: '/directory' },
};

/** A browsable map of every public page, by town, then prices and ideas. */
export default async function Directory() {
  const [landing, costs, towns, topics, collections] = await Promise.all([landingEntries(sql), costEntries(sql), townsWithVendors(sql), ideaTopics(sql), publishedCollections(sql)]);
  // Every town with pages, launched towns first, grouped by state.
  const byCity = towns
    .map((c) => ({ city: c, pages: landing.filter((l) => l.path.startsWith(`/vendors/${c.slug}/`)) }))
    .filter((x) => x.pages.length);
  const national = landing.filter((l) => l.path.startsWith('/vendors/india/'));
  const states = [...new Set(byCity.map((x) => x.city.state))];
  return (
    <Container className="max-w-6xl">
      <h1 className="text-3xl font-semibold">All wedding vendor pages</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-muted)]">Every town, category and price guide on Olready. Pages appear here once enough vendors are listed to make them useful.</p>

      {national.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Across India</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {national.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
                  {p.title}
                </Link>{' '}
                <span className="text-[var(--color-muted)]">{p.vendors}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {states.map((state) => (
      <section key={state} className="mt-10">
        <h2 className="text-xl font-semibold">{state}</h2>
        <div className="mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {byCity.filter((x) => x.city.state === state).map(({ city, pages }) => (
            <div key={city.slug}>
              <h3 className="font-semibold">
                <Link href={`/vendors/${city.slug}`} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
                  {city.name}
                </Link>
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {pages
                  .filter((p) => p.path.split('/').length === 4)
                  .map((p) => (
                    <li key={p.path}>
                      <Link href={p.path} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
                        {p.title}
                      </Link>{' '}
                      <span className="text-[var(--color-muted)]">{p.vendors}</span>
                      {pages.some((x) => x.path.startsWith(p.path + '/')) ? (
                        <ul className="mb-1 ml-3 mt-1 space-y-0.5 text-[13px] text-[var(--color-muted)]">
                          {pages
                            .filter((x) => x.path.startsWith(p.path + '/'))
                            .map((x) => (
                              <li key={x.path}>
                                <Link href={x.path} className="inline-block py-1 hover:text-[var(--color-ink)]">
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
      ))}

      {costs.length ? (
        <section className="mt-12 scroll-mt-24" id="costs">
          <h2 className="text-xl font-semibold">Wedding costs</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[...new Set(costs.map((c) => c.path.split('/')[2]))].map((slug) => {
              const group = costs.filter((c) => c.path.split('/')[2] === slug);
              const [name] = group[0].title.split(' cost in ');
              return (
                <li key={slug}>
                  <span className="font-medium">{name} cost</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3">
                    {group.map((c) => (
                      <Link key={c.path} href={c.path} className="inline-block py-0.5 text-[var(--color-muted)] hover:text-[var(--color-pink-deep)]" aria-label={c.title}>
                        {c.title.split(' cost in ')[1]?.replace(/^India$/, 'All of India')}
                      </Link>
                    ))}
                  </span>
                </li>
              );
            })}
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
                  <Link href={`/ideas/${t.slug}`} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
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
                <Link href={`/blog/section/${k}`} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
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
                <Link href={`/collections/${c.slug}`} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
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
              ['/about', 'About Olready'],
              ['/contact', 'Contact'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="inline-block py-0.5 hover:text-[var(--color-pink-deep)]">
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
