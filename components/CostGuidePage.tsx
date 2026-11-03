import Link from 'next/link';
import { formatInr } from '@/lib/catalog';
import { type CostGuide, costFaq, costPath, costTitle } from '@/lib/costGuide';
import { landingPath } from '@/lib/seo';
import { siteUrl } from '@/lib/seo';
import { Container } from './ui';
import { JsonLd } from './VendorCard';

/** A price guide: the range as a band, then the figures behind it, then where to go next. */
export function CostGuidePage({ g, otherCities }: { g: CostGuide; otherCities: { slug: string; name: string }[] }) {
  const where = g.city?.name ?? 'Chandigarh Tricity';
  const faq = costFaq(g);
  const span = Math.max(1, g.max - g.min);
  const at = (x: number) => `${Math.round(((x - g.min) / span) * 100)}%`;
  const listing = g.city ? landingPath(g.city, g.category) : `/vendors`;
  const crumbs = [
    { name: 'OLReady', path: '/' },
    { name: 'Wedding costs', path: '/directory#costs' },
    { name: g.category.plural_name, path: costPath(g.category.slug) },
    ...(g.city ? [{ name: g.city.name, path: costPath(g.category.slug, g.city.slug) }] : []),
  ];
  return (
    <Container className="max-w-4xl">
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
          { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: siteUrl() + c.path })) },
        ]}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-muted)]">
        {crumbs.slice(1).map((c, i, a) => (
          <span key={c.path}>
            {i ? ' / ' : ''}
            {i === a.length - 1 ? c.name : <Link href={c.path}>{c.name}</Link>}
          </span>
        ))}
      </nav>
      <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{costTitle(g)}</h1>
      <p className="mt-3 max-w-2xl text-lg text-[var(--color-muted)]">
        {g.category.plural_name} in {where} start from <b className="text-[var(--color-ink)]">{formatInr(g.min)}</b> {g.category.price_unit}. Most start between{' '}
        <b className="text-[var(--color-ink)]">{formatInr(g.low)}</b> and <b className="text-[var(--color-ink)]">{formatInr(g.high)}</b>.
      </p>

      <figure className="mt-8 rounded-[22px] border border-[var(--color-line)] p-5">
        <figcaption className="text-sm text-[var(--color-muted)]">
          Starting prices of {g.priced} {g.category.plural_name.toLowerCase()} listed on OLReady, {g.category.price_unit}
        </figcaption>
        <div className="relative mt-10 h-3 rounded-full bg-[var(--color-tint)]" role="img" aria-label={`From ${formatInr(g.min)} to ${formatInr(g.max)}; most between ${formatInr(g.low)} and ${formatInr(g.high)}; middle ${formatInr(g.mid)}`}>
          <div className="absolute inset-y-0 rounded-full bg-[var(--color-pink-soft)] ring-1 ring-[var(--color-pink)]" style={{ left: at(g.low), right: `calc(100% - ${at(g.high)})` }} />
          <div className="absolute -top-8 -translate-x-1/2 text-center" style={{ left: at(g.mid) }}>
            <span className="figure text-xl">{formatInr(g.mid)}</span>
          </div>
          <div className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 bg-[var(--color-pink-deep)]" style={{ left: at(g.mid) }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-[var(--color-muted)]">
          <span>{formatInr(g.min)}</span>
          <span>most: {formatInr(g.low)} to {formatInr(g.high)}</span>
          <span>{formatInr(g.max)}</span>
        </div>
        {g.quoteMid ? (
          <p className="mt-4 text-sm">
            Real quotes run higher: the middle of {g.quotes} quotes brides received on OLReady this year was <b>{formatInr(g.quoteMid)}</b>.
          </p>
        ) : null}
      </figure>

      {g.breakdown.length >= 2 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">By type</h2>
          <ul className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
            {g.breakdown.map((b) => (
              <li key={b.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <span>{b.label}</span>
                <span>
                  <span className="figure text-lg">{formatInr(b.mid)}</span> <span className="text-xs text-[var(--color-muted)]">middle of {b.n}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Lowest starting prices</h2>
          <ul className="mt-3 space-y-2">
            {g.cheapest.map((v) => (
              <li key={v.slug} className="flex justify-between gap-3">
                <Link href={`/v/${v.slug}`} className="font-medium text-[var(--color-pink-deep)] underline-offset-4 hover:underline">
                  {v.name}
                </Link>
                <span className="text-sm text-[var(--color-muted)]">
                  {formatInr(v.price)}, {v.city}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {g.topRated.length ? (
          <div>
            <h2 className="text-xl font-semibold">Best reviewed</h2>
            <ul className="mt-3 space-y-2">
              {g.topRated.map((v) => (
                <li key={v.slug} className="flex justify-between gap-3">
                  <Link href={`/v/${v.slug}`} className="font-medium text-[var(--color-pink-deep)] underline-offset-4 hover:underline">
                    {v.name}
                  </Link>
                  <span className="text-sm text-[var(--color-muted)]">
                    ★ {v.rating.toFixed(1)} from {v.reviews}
                    {v.price ? `, from ${formatInr(v.price)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Questions</h2>
        <div className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {faq.map((f) => (
            <div key={f.q} className="py-4">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[var(--color-muted)]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-[22px] bg-[var(--color-pink-soft)] p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Get real quotes for your date</h2>
          <p className="text-sm text-[var(--color-muted)]">One request, a short call from our team, then verified vendors quote you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={listing} className="btn btn-ghost">
            See {g.category.plural_name.toLowerCase()}
          </Link>
          <Link href={`/enquire?category=${g.category.slug}${g.city ? `&city=${g.city.slug}` : ''}`} className="btn btn-pink">
            Get quotes
          </Link>
        </div>
      </div>

      {otherCities.length ? (
        <nav aria-label="Other towns" className="mt-10">
          <h2 className="font-semibold">{g.category.name} cost in other towns</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {g.city ? (
              <li>
                <Link href={costPath(g.category.slug)} className="chip">
                  Whole Tricity
                </Link>
              </li>
            ) : null}
            {otherCities.map((c) => (
              <li key={c.slug}>
                <Link href={costPath(g.category.slug, c.slug)} className="chip">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <p className="mt-8 text-xs text-[var(--color-muted)]">Figures update automatically from live OLReady listings and quotes. Starting prices are each vendor’s lowest package.</p>
    </Container>
  );
}
