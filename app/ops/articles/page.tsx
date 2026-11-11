import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { SECTIONS, allArticles } from '@/lib/articles';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Articles' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d) : '');

export default async function Articles({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['content', 'ops', 'admin']);
  const rows = await allArticles(sql);
  return (
    <>
      <PageTitle
        title="Articles"
        sub="Guides and ideas for the blog. Write, preview, then publish."
        action={
          <Link href="/ops/articles/new" className="btn btn-pink btn-sm">
            New article
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      {rows.length ? (
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="data stack">
            <thead>
              <tr>
                <th>Title</th>
                <th>Section</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link className="font-semibold hover:underline" href={`/ops/articles/${a.id}`}>
                      {a.title}
                    </Link>
                  </td>
                  <td>{SECTIONS[a.section]?.label}</td>
                  <td>
                    <Badge tone={a.status === 'published' ? 'ok' : a.status === 'archived' ? 'plain' : 'warn'}>{a.status}</Badge>
                  </td>
                  <td>{fmt(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty art="list" title="No articles yet">Start with a guide brides ask your team about every week.</Empty>
      )}
    </>
  );
}
