import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { wallItems } from '@/lib/ideas';
import { shortlist } from '@/lib/weddings';
import { wallNoteAction } from '@/lib/actions/ideas';
import { formatInr } from '@/lib/catalog';
import { Card, Cover, Empty, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Wedding wall', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Wall({ searchParams }: P) {
  const q = await searchParams;
  const { w } = await requireBrideWedding('/me/wall');
  const [items, vendors] = await Promise.all([wallItems(sql, w.id), shortlist(sql, w.id)]);
  const photos = items.filter((i) => i.photo);
  const articles = items.filter((i) => i.article);
  return (
    <>
      <PageTitle
        title="Wedding wall"
        sub="Everything your family saved: looks, decor, guides and vendors. Everyone you added under Family sees the same wall and can leave notes."
        action={
          <Link href="/ideas" className="btn btn-ghost btn-sm">
            Find more ideas
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      {!items.length && !vendors.length ? (
        <Empty title="Nothing saved yet">
          Tap the heart on any photo in <Link className="underline" href="/ideas">Ideas</Link>, any guide, or any vendor to save it here.
        </Empty>
      ) : null}

      {photos.length ? (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Saved looks and ideas ({photos.length})</h2>
          <ul className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {photos.map((i) => (
              <li key={i.id} className="mb-4 break-inside-avoid">
                <Card className="overflow-hidden p-0">
                  <Link href={`/ideas/photo/${i.ref}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.photo!.url} alt={i.photo!.caption || i.photo!.topic_name} className="w-full" loading="lazy" />
                  </Link>
                  <div className="p-3 text-sm">
                    {i.photo!.vendor_slug ? (
                      <Link href={`/v/${i.photo!.vendor_slug}`} className="font-semibold hover:text-[var(--color-pink-deep)]">
                        {i.photo!.vendor_name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{i.photo!.topic_name}</span>
                    )}
                    <p className="text-xs text-[var(--color-muted)]">Saved by {i.saved_by_name || 'family'}</p>
                    <form action={wallNoteAction} className="mt-2 space-y-1">
                      <input type="hidden" name="id" value={i.id} />
                      <textarea name="note" rows={2} defaultValue={i.note} maxLength={500} className="input py-1 text-xs" placeholder="Add a note for the family" aria-label="Note" />
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm py-0.5">Save note</button>
                        <button name="remove" value="1" className="btn btn-ghost btn-sm py-0.5" aria-label="Remove from wall">
                          Remove
                        </button>
                      </div>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vendors.length ? (
        <section className="mb-10">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-semibold">Shortlisted vendors ({vendors.length})</h2>
            <Link href="/me/shortlist" className="text-sm font-semibold text-[var(--color-pink-deep)]">
              Ask them all for quotes
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <li key={v.vendor_id}>
                <Link href={`/v/${v.slug}`} className="card block p-4 hover:shadow-md">
                  <p className="text-xs text-[var(--color-muted)]">{v.category_name}</p>
                  <p className="font-semibold">{v.business_name}</p>
                  <p className="text-sm">{v.starting_price_inr != null ? `${formatInr(v.starting_price_inr)} ${v.price_unit}` : 'Price on request'}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {articles.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Saved guides ({articles.length})</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {articles.map((i) => (
              <li key={i.id}>
                <Card className="flex gap-3">
                  <Link href={`/blog/${i.article!.slug}`} className="block h-20 w-24 shrink-0 overflow-hidden rounded-[10px]">
                    <Cover url={i.article!.cover_url} name={i.article!.title} />
                  </Link>
                  <div className="min-w-0 text-sm">
                    <Link href={`/blog/${i.article!.slug}`} className="font-semibold hover:text-[var(--color-pink-deep)]">
                      {i.article!.title}
                    </Link>
                    <p className="text-xs text-[var(--color-muted)]">Saved by {i.saved_by_name || 'family'}</p>
                    <form action={wallNoteAction} className="mt-1 flex gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="note" value={i.note} />
                      <button name="remove" value="1" className="text-xs underline">
                        Remove
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
