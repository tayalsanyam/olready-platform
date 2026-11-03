import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { SECTIONS, publishedArticles } from '@/lib/articles';
import { Container, Empty, PageTitle } from '@/components/ui';
import { ArticleCard } from '@/components/ArticleCard';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: P) {
  const s = SECTIONS[(await params).section];
  if (!s) return { title: 'Not found', robots: { index: false } };
  return { title: `${s.label}: wedding guides`, description: s.blurb, alternates: { canonical: `/blog/section/${(await params).section}` } };
}

export default async function Section({ params }: P) {
  const { section } = await params;
  const s = SECTIONS[section];
  if (!s) notFound();
  const list = await publishedArticles(sql, { section, limit: 48 });
  return (
    <Container>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        <Link href="/blog">Guides</Link> / {s.label}
      </nav>
      <PageTitle title={s.label} sub={s.blurb} />
      {list.length ? (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <ArticleCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing here yet" />
      )}
    </Container>
  );
}
