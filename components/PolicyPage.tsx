import Link from 'next/link';
import { LEGAL_EFFECTIVE, LEGAL_VERSION, POLICIES, type Policy } from '@/lib/legal';
import { Container } from './ui';
import { JsonLd } from './VendorCard';
import { siteUrl } from '@/lib/seo';

/** A policy page: contents on the side for long reading, each section linkable. */
export function PolicyPage({ p }: { p: Policy }) {
  const others = Object.values(POLICIES).filter((x) => x.slug !== p.slug);
  return (
    <Container className="max-w-5xl">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `${p.title} | OLReady`,
          url: `${siteUrl()}/${p.slug}`,
          dateModified: LEGAL_EFFECTIVE,
          publisher: { '@type': 'Organization', name: 'OLReady', url: siteUrl() },
        }}
      />
      <p className="text-sm text-[var(--color-muted)]">
        Version {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE}
      </p>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{p.title}</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-muted)]">{p.summary}</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <details className="rounded-2xl border border-[var(--color-line)] p-3 lg:border-0 lg:p-0" open>
            <summary className="cursor-pointer text-sm font-semibold lg:cursor-default">On this page</summary>
            <ol className="mt-2 space-y-1.5 text-sm">
              {p.sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
        <article className="max-w-[68ch] text-[15px] leading-[1.7]">
          {p.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 pb-6">
              <h2 className="text-lg font-semibold">
                {i + 1}. {s.heading}
              </h2>
              {s.body.map((para, j) => (
                <p key={j} className="mt-2">
                  {para}
                </p>
              ))}
            </section>
          ))}
          <div className="mt-4 rounded-2xl bg-[var(--color-tint)] p-4 text-sm">
            Read with:{' '}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i ? ' and ' : ''}
                <Link href={`/${o.slug}`} className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">
                  {o.title}
                </Link>
              </span>
            ))}
            . Questions: <Link href="/contact" className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">contact us</Link>.
          </div>
        </article>
      </div>
    </Container>
  );
}

/** The required tick-box at checkout and onboarding. */
export function AcceptTerms({ refunds = true }: { refunds?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="accept_terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-pink)]" />
      <span>
        I accept the{' '}
        <Link href="/terms" target="_blank" className="underline underline-offset-2">
          Terms of Use
        </Link>
        {refunds ? (
          <>
            {' '}and the{' '}
            <Link href="/refunds" target="_blank" className="underline underline-offset-2">
              Refund and Cancellation Policy
            </Link>
          </>
        ) : null}
        .
      </span>
    </label>
  );
}
