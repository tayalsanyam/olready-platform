import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { countIdeaPhotos, ideaPhotos, ideaTopic, savedRefs, topicTags } from '@/lib/ideas';
import { listCities } from '@/lib/catalog';
import { Container, Empty, Notice, PageTitle, sp } from '@/components/ui';
import { IdeaGrid } from '@/components/IdeaGrid';
import { JsonLd } from '@/components/VendorCard';
import { breadcrumbLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';
const PER_PAGE = 30;
type P = { params: Promise<{ topic: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params, searchParams }: P) {
  const t = await ideaTopic(sql, (await params).topic);
  if (!t) return { title: 'Not found', robots: { index: false } };
  const q = await searchParams;
  const filtered = Boolean(sp(q.tag) || sp(q.page));
  return {
    title: `${t.name}: photos and ideas`,
    description: `${t.description} Browse photos from OLReady vendors, save your favourites and get quotes.`,
    alternates: { canonical: `/ideas/${t.slug}` },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function Topic({ params, searchParams }: P) {
  const { topic } = await params;
  const q = await searchParams;
  const t = await ideaTopic(sql, topic);
  if (!t) notFound();
  const tags = await topicTags(sql, t.id);
  const tag = tags.find((x) => x.slug === sp(q.tag))?.slug ?? null;
  const page = Math.max(1, Number(sp(q.page)) || 1);
  const viewer = await currentProfile();
  const [photos, total, saved, cities] = await Promise.all([
    ideaPhotos(sql, { topic: t.slug, tag, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    countIdeaPhotos(sql, { topic: t.slug, tag }),
    savedRefs(sql, viewer?.role === 'bride' ? viewer.id : null, 'photo'),
    listCities(sql),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages && page > 1) notFound();
  const href = (tg: string | null, p = 1) => {
    const u = new URLSearchParams();
    if (tg) u.set('tag', tg);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `/ideas/${t.slug}${s ? `?${s}` : ''}`;
  };
  const category = t.category_id ? (await sql<{ slug: string; plural_name: string }[]>`select slug, plural_name from mkt.categories where id = ${t.category_id} and active`)[0] : null;
  return (
    <Container>
      <JsonLd data={breadcrumbLd([{ name: 'Ideas', path: '/ideas' }, { name: t.name, path: `/ideas/${t.slug}` }])} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        <Link href="/ideas">Ideas</Link> / {t.name}
      </nav>
      <PageTitle
        title={t.name}
        sub={
          <>
            <span className="figure text-lg text-[var(--color-ink)]">{total}</span> photo{total === 1 ? '' : 's'}. {t.description}
          </>
        }
        action={
          category && cities[0] ? (
            <Link href={`/vendors/${cities[0].slug}/${category.slug}`} className="btn btn-ghost">
              See {category.plural_name.toLowerCase()}
            </Link>
          ) : null
        }
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      {tags.length ? (
        <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by style">
          <Link href={href(null)} className="chip" aria-current={!tag}>
            All
          </Link>
          {tags.map((x) => (
            <Link key={x.slug} href={href(x.slug)} className="chip" aria-current={tag === x.slug}>
              {x.label}
            </Link>
          ))}
        </div>
      ) : null}
      {photos.length ? (
        <IdeaGrid photos={photos} saved={saved} backPath={href(tag, page)} />
      ) : (
        <Empty title="No photos here yet">
          Try another style, or <Link className="underline" href="/ideas">browse all ideas</Link>.
        </Empty>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link rel="prev" href={href(tag, page - 1)} className="btn btn-ghost btn-sm">
              Previous
            </Link>
          ) : null}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link rel="next" href={href(tag, page + 1)} className="btn btn-ghost btn-sm">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Container>
  );
}
