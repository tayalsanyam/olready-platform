import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { SECTIONS, articleById } from '@/lib/articles';
import { listCategories, listCities } from '@/lib/catalog';
import { opsArticleStatus, opsSaveArticle } from '@/lib/actions/content2';
import { Badge, Card, Field, Notice, PageTitle } from '@/components/ui';
import { ArticleBody } from '@/components/ArticleEditor';

export const metadata = { title: 'Edit article' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function EditArticle({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const me = await requireRole(['content', 'ops', 'admin']);
  const isNew = id === 'new';
  const a = isNew ? null : /^[0-9a-f-]{36}$/.test(id) ? await articleById(sql, id) : null;
  if (!isNew && !a) notFound();
  const [cats, cities] = await Promise.all([listCategories(sql, { activeOnly: true }), listCities(sql)]);
  return (
    <>
      <PageTitle
        title={isNew ? 'New article' : a!.title}
        sub={
          a ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={a.status === 'published' ? 'ok' : 'warn'}>{a.status}</Badge>
              {a.status === 'published' ? (
                <Link className="underline" href={`/blog/${a.slug}`} target="_blank">
                  View on the blog
                </Link>
              ) : (
                <Link className="underline" href={`/blog/${a.slug}?preview=1`} target="_blank">
                  Preview page
                </Link>
              )}
            </span>
          ) : (
            'Saved as a draft until you publish it.'
          )
        }
        action={
          <Link href="/ops/articles" className="btn btn-ghost btn-sm">
            All articles
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <Card>
        <form action={opsSaveArticle} className="space-y-4">
          {a ? <input type="hidden" name="id" value={a.id} /> : null}
          <Field label="Title *">
            <input name="title" required minLength={5} maxLength={140} defaultValue={a?.title} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Web address" hint="Leave empty to make one from the title">
              <input name="slug" defaultValue={a?.slug} className="input" placeholder="how-to-choose-a-venue" />
            </Field>
            <Field label="Author">
              <input name="author_name" defaultValue={a?.author_name ?? me.full_name ?? 'OLReady team'} className="input" />
            </Field>
          </div>
          <Field label="One-line summary *" hint="Shown on cards and in Google results">
            <input name="excerpt" maxLength={300} defaultValue={a?.excerpt} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Section">
              <select name="section" defaultValue={a?.section ?? 'planning'} className="input">
                {Object.entries(SECTIONS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vendor category (shows matching vendors)">
              <select name="category_id" defaultValue={a?.category_id ?? ''} className="input">
                <option value="">None</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.plural_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <select name="city_id" defaultValue={a?.city_id ?? ''} className="input">
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Cover photo" hint={a?.cover_url ? 'Uploading a new one replaces the current cover' : 'Wide photos work best'}>
            <input type="file" name="cover" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          </Field>
          <ArticleBody initial={a?.body ?? ''} />
          <button className="btn btn-pink">Save</button>
        </form>
      </Card>
      {a ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(['published', 'draft', 'archived'] as const)
            .filter((s) => s !== a.status)
            .map((s) => (
              <form key={s} action={opsArticleStatus}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value={s} />
                <button className={`btn btn-sm ${s === 'published' ? '' : 'btn-ghost'}`}>{s === 'published' ? 'Publish' : s === 'draft' ? 'Back to draft' : 'Archive'}</button>
              </form>
            ))}
        </div>
      ) : null}
    </>
  );
}
