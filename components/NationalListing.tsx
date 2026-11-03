import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { fieldsFor, formatInr, getCategoryBySlug, listCategories, listCities } from '@/lib/catalog';
import { browseVendors, countVendors } from '@/lib/vendors';
import { townsWithVendors } from '@/lib/locations';
import { breadcrumbLd, faqLd, indexable, itemListLd } from '@/lib/seo';
import { costGuide, costPath } from '@/lib/costGuide';
import { currentProfile } from '@/lib/auth';
import { shortlistedIds } from '@/lib/weddings';
import { Container, Empty, PageTitle } from './ui';
import { JsonLd, VendorCard } from './VendorCard';

// India-wide pages: /vendors/india (every category) and /vendors/india/<category>.
type Town = Awaited<ReturnType<typeof townsWithVendors>>[number];

export async function nationalMetadata(categorySlug?: string): Promise<Metadata> {
  if (!categorySlug) {
    return {
      title: 'Wedding vendors across India',
      description: 'Verified wedding venues, caterers, makeup artists, photographers, decorators and more in towns across India. Compare prices and get quotes on OLReady.',
      alternates: { canonical: '/vendors/india' },
    };
  }
  const cat = await getCategoryBySlug(sql, categorySlug);
  if (!cat?.active) return { title: 'Not found', robots: { index: false } };
  const total = await countVendors(sql, { categoryId: cat.id });
  return {
    title: `${cat.plural_name} in India with prices, photos and reviews`,
    description: `Compare ${total} verified ${cat.plural_name.toLowerCase()} across India on OLReady. See starting prices and reviews by town, then get quotes.`,
    alternates: { canonical: `/vendors/india/${cat.slug}` },
    robots: (await indexable(sql, total)) ? undefined : { index: false, follow: true },
  };
}

export async function NationalCategory({ categorySlug }: { categorySlug: string }) {
  const cat = await getCategoryBySlug(sql, categorySlug);
  if (!cat?.active) notFound();
  const viewer = await currentProfile();
  const [fields, vendors, total, towns, guide, hearts] = await Promise.all([
    fieldsFor(sql, cat.id),
    browseVendors(sql, { categoryId: cat.id, limit: 24 }),
    countVendors(sql, { categoryId: cat.id }),
    townsWithVendors(sql, cat.id),
    costGuide(sql, cat.slug, null),
    shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null),
  ]);
  const byState = new Map<string, Town[]>();
  for (const t of towns) byState.set(t.state, [...(byState.get(t.state) ?? []), t]);
  const faq = [
    { q: `Where can I find ${cat.plural_name.toLowerCase()} on OLReady?`, a: `${total} verified ${cat.plural_name.toLowerCase()} are listed across ${towns.length} towns. Pick your town to compare prices, photos and reviews.` },
    ...(guide ? [{ q: `How much do ${cat.plural_name.toLowerCase()} cost in India?`, a: `Starting prices on OLReady begin at ${formatInr(guide.min)} ${cat.price_unit}; most start between ${formatInr(guide.low)} and ${formatInr(guide.high)}.` }] : []),
    { q: 'How do I get quotes?', a: 'Send one request with your functions, dates and town. Our team confirms it on a short call, then verified vendors quote you on OLReady.' },
  ];
  return (
    <Container>
      <JsonLd data={[breadcrumbLd([{ name: 'Vendors', path: '/vendors' }, { name: 'India', path: '/vendors/india' }, { name: cat.plural_name, path: `/vendors/india/${cat.slug}` }]), itemListLd(vendors), faqLd(faq)]} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        <Link href="/vendors">Vendors</Link> / <Link href="/vendors/india">India</Link> / {cat.plural_name}
      </nav>
      <PageTitle
        title={`${cat.plural_name} in India`}
        sub={`${total} verified ${total === 1 ? 'vendor' : 'vendors'} in ${towns.length} ${towns.length === 1 ? 'town' : 'towns'}, prices ${cat.price_unit}`}
        action={
          <Link href={`/enquire?category=${cat.slug}`} className="btn btn-pink">
            Get verified quotes
          </Link>
        }
      />
      {towns.length ? (
        <section aria-labelledby="by-town" className="mb-8">
          <h2 id="by-town" className="mb-3 text-lg font-semibold">
            By town
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...byState.entries()].map(([state, ts]) => (
              <div key={state}>
                <h3 className="text-sm font-medium text-[var(--color-muted)]">{state}</h3>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {ts.map((t) => (
                    <li key={t.id}>
                      <Link href={`/vendors/${t.slug}/${cat.slug}`} className="hover:text-[var(--color-pink-deep)]">
                        {t.name} <span className="text-[var(--color-muted)]">{t.vendors}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {vendors.length ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vendors.map((v) => (
            <VendorCard key={v.id} v={v} fields={fields} backPath={`/vendors/india/${cat.slug}`} shortlisted={hearts.has(v.id)} />
          ))}
        </div>
      ) : (
        <Empty title={`No ${cat.plural_name.toLowerCase()} listed yet`}>
          Tell us your town and what you need, and our team will find verified vendors.{' '}
          <Link className="underline" href={`/enquire?category=${cat.slug}`}>
            Get quotes
          </Link>
        </Empty>
      )}
      {guide?.indexable ? (
        <p className="mt-8 text-sm">
          <Link href={costPath(cat.slug)} className="font-medium text-[var(--color-pink-deep)] underline">
            What {cat.plural_name.toLowerCase()} cost in India
          </Link>
        </p>
      ) : null}
      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold">Questions</h2>
        <dl className="mt-2 divide-y divide-[var(--color-line)]">
          {faq.map((f) => (
            <div key={f.q} className="py-3">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-[var(--color-muted)]">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Container>
  );
}

export async function NationalHub() {
  const [cats, towns, launched] = await Promise.all([listCategories(sql, { activeOnly: true }), townsWithVendors(sql), listCities(sql)]);
  const counts = await Promise.all(cats.map((c) => countVendors(sql, { categoryId: c.id })));
  const byState = new Map<string, Town[]>();
  for (const t of towns) byState.set(t.state, [...(byState.get(t.state) ?? []), t]);
  return (
    <Container>
      <PageTitle title="Wedding vendors across India" sub="Pick a category, or a town to see everything in it." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c, i) => (
          <Link key={c.slug} href={`/vendors/india/${c.slug}`} className="card block p-4 hover:shadow-md">
            <h2 className="font-semibold">{c.plural_name}</h2>
            <p className="text-sm text-[var(--color-muted)]">{counts[i]} listed</p>
          </Link>
        ))}
      </div>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Towns</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {launched.map((t) => (
            <li key={t.id}>
              <Link href={`/vendors/${t.slug}`} className="chip">
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...byState.entries()].map(([state, ts]) => (
            <div key={state}>
              <h3 className="text-sm font-medium text-[var(--color-muted)]">{state}</h3>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {ts.map((t) => (
                  <li key={t.id}>
                    <Link href={`/vendors/${t.slug}`} className="hover:text-[var(--color-pink-deep)]">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Container>
  );
}
