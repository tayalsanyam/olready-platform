import Link from 'next/link';
import { sql } from '@/lib/db';
import { SECTIONS, countPublished, publishedArticles } from '@/lib/articles';
import { Container, Empty, Notice, PageTitle, sp } from '@/components/ui';
import { ArticleCard } from '@/components/ArticleCard';
import { Newsletter } from '@/components/Newsletter';

export const dynamic = 'force-dynamic';
const PER = 12;
type P = { searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ searchParams }: P) {
  const page = Number(sp((await searchParams).page)) || 1;
  return {
    title: 'Wedding planning guides and ideas',
    description: 'Practical guides for weddings in India: venues, budgets, makeup, photography, decor and real advice from families.',
    alternates: { canonical: page > 1 ? `/blog?page=${page}` : '/blog' },
  };
}

export default async function Blog({ searchParams }: P) {
  const q = await searchParams;
  const page = Math.max(1, Number(sp(q.page)) || 1);
  const [list, total] = await Promise.all([publishedArticles(sql, { limit: PER, offset: (page - 1) * PER }), countPublished(sql)]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const [lead, ...rest] = list;
  return (
    <Container>
      <PageTitle title="Wedding guides" sub="Straight answers for planning a wedding in India." />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Sections">
        <Link href="/blog" className="chip" aria-current>
          All
        </Link>
        {Object.entries(SECTIONS).map(([k, s]) => (
          <Link key={k} href={`/blog/section/${k}`} className="chip">
            {s.label}
          </Link>
        ))}
      </div>
      {lead ? (
        <>
          {page === 1 ? (
            <div className="mb-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
              <ArticleCard a={lead} big />
              <Newsletter backPath="/blog" />
            </div>
          ) : null}
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {(page === 1 ? rest : list).map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        </>
      ) : (
        <Empty art="list" title="No guides yet">Our team is writing them. Meanwhile, browse ideas or real weddings.</Empty>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link rel="prev" className="btn btn-ghost btn-sm" href={page === 2 ? '/blog' : `/blog?page=${page - 1}`}>
              Newer
            </Link>
          ) : null}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link rel="next" className="btn btn-ghost btn-sm" href={`/blog?page=${page + 1}`}>
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Container>
  );
}
