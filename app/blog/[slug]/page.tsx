import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { SECTIONS, articleBySlug, publishedArticles } from '@/lib/articles';
import { Markdown, plainText, readingMinutes } from '@/lib/markdown';
import { fieldsFor, listCities } from '@/lib/catalog';
import { browseVendors } from '@/lib/vendors';
import { savedRefs } from '@/lib/ideas';
import { saveItemAction } from '@/lib/actions/ideas';
import { breadcrumbLd, siteUrl } from '@/lib/seo';
import { Container, Notice, sp } from '@/components/ui';
import { ArticleCard } from '@/components/ArticleCard';
import { Newsletter } from '@/components/Newsletter';
import { JsonLd, VendorCard } from '@/components/VendorCard';
import { IconHeart } from '@/components/icons';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d) : '');

async function load(slug: string, preview: boolean) {
  const viewer = await currentProfile();
  const staff = Boolean(viewer && STAFF_ROLES.includes(viewer.role));
  const a = await articleBySlug(sql, slug, { includeDrafts: preview && staff });
  return { a, viewer };
}

export async function generateMetadata({ params, searchParams }: P) {
  const { a } = await load((await params).slug, sp((await searchParams).preview) === '1');
  if (!a) return { title: 'Not found', robots: { index: false } };
  return {
    title: a.title,
    description: a.excerpt || plainText(a.body).slice(0, 155),
    alternates: { canonical: `/blog/${a.slug}` },
    robots: a.status === 'published' ? undefined : { index: false },
    openGraph: { type: 'article', title: a.title, images: a.cover_url ? [a.cover_url] : undefined },
  };
}

export default async function ArticlePage({ params, searchParams }: P) {
  const { slug } = await params;
  const q = await searchParams;
  const { a, viewer } = await load(slug, sp(q.preview) === '1');
  if (!a) notFound();
  const cities = await listCities(sql);
  const city = cities.find((c) => c.id === a.city_id) ?? cities[0];
  const [related, vendors, fields, saved] = await Promise.all([
    publishedArticles(sql, { section: a.section, exclude: a.id, limit: 3 }),
    a.category_id ? browseVendors(sql, { categoryId: a.category_id, cityId: city?.id, sort: 'rating', limit: 4 }) : Promise.resolve([]),
    a.category_id ? fieldsFor(sql, a.category_id) : Promise.resolve([]),
    savedRefs(sql, viewer?.role === 'bride' ? viewer.id : null, 'article'),
  ]);
  const self = `/blog/${a.slug}`;
  const on = saved.has(a.id);
  const share = `https://wa.me/?text=${encodeURIComponent(`${a.title} ${siteUrl()}${self}`)}`;
  return (
    <Container>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: a.title,
            description: a.excerpt,
            image: a.cover_url ? [a.cover_url] : undefined,
            datePublished: a.published_at?.toISOString(),
            dateModified: a.updated_at.toISOString(),
            author: { '@type': 'Organization', name: a.author_name },
            publisher: { '@type': 'Organization', name: 'OLReady', logo: { '@type': 'ImageObject', url: `${siteUrl()}/icon.png` } },
            mainEntityOfPage: `${siteUrl()}${self}`,
          },
          breadcrumbLd([
            { name: 'Guides', path: '/blog' },
            { name: SECTIONS[a.section]?.label ?? 'Guides', path: `/blog/section/${a.section}` },
            { name: a.title, path: self },
          ]),
        ]}
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      {a.status !== 'published' ? <p className="mb-4 rounded-xl bg-[var(--color-pink-soft)] px-3 py-2 text-sm">Preview: this article is a {a.status}.</p> : null}
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-muted)]">
          <Link href="/blog">Guides</Link> / <Link href={`/blog/section/${a.section}`}>{SECTIONS[a.section]?.label}</Link>
        </nav>
        <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{a.title}</h1>
        {a.excerpt ? <p className="mt-3 text-lg text-[var(--color-muted)]">{a.excerpt}</p> : null}
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          {a.author_name} · {fmt(a.published_at ?? a.updated_at)} · {readingMinutes(a.body)} min read
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={saveItemAction}>
            <input type="hidden" name="kind" value="article" />
            <input type="hidden" name="ref" value={a.id} />
            <input type="hidden" name="_back" value={self} />
            <button className={`btn btn-ghost btn-sm ${on ? 'text-[var(--color-pink)]' : ''}`} aria-pressed={on}>
              <IconHeart size={16} filled={on} />
              {on ? 'Saved' : 'Save to wedding wall'}
            </button>
          </form>
          <a href={share} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            Share on WhatsApp
          </a>
        </div>
        {a.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover_url} alt="" className="mt-6 aspect-[16/9] w-full rounded-[18px] object-cover" />
        ) : null}
        <div className="mt-6">
          <Markdown source={a.body} />
        </div>
      </article>

      {vendors.length ? (
        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-xl font-semibold">
              Top-rated {vendors[0].category_name.toLowerCase()}s in {city?.name}
            </h2>
            {city ? (
              <Link href={`/vendors/${city.slug}/${a.category_slug}`} className="whitespace-nowrap text-sm font-semibold text-[var(--color-pink-deep)]">
                See all
              </Link>
            ) : null}
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {vendors.map((v) => (
              <VendorCard key={v.id} v={v} fields={fields} backPath={self} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mx-auto mt-12 max-w-3xl">
        <Newsletter backPath={self} />
      </div>

      {related.length ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">More {SECTIONS[a.section]?.label.toLowerCase()} guides</h2>
          <div className="mt-4 grid gap-x-6 gap-y-10 sm:grid-cols-3">
            {related.map((r) => (
              <ArticleCard key={r.id} a={r} />
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
