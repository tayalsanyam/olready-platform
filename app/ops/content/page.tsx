import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { moderationQueue, realWeddingBySlug } from '@/lib/realWeddings';
import { opsModerateWedding, opsTagVendor } from '@/lib/actions/ops';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Real weddings' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Content({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['content', 'ops', 'admin']);
  const queue = await moderationQueue(sql);
  const detailed = await Promise.all(queue.map((w) => realWeddingBySlug(sql, w.slug, { includeUnpublished: true })));
  return (
    <>
      <PageTitle title="Real weddings to review" sub="Check consent, photo rights and vendor tags before publishing." />
      <Notice error={q.error} ok={q.ok} />
      {detailed.length ? (
        <ul className="space-y-4">
          {detailed.map((w) =>
            w ? (
              <li key={w.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b>{w.couple_names}</b> · {w.title}
                      <div className="hint">
                        {w.city_name ?? 'no city'} · {w.wedding_date ?? 'no date'} · {w.photos.length} photos
                      </div>
                    </div>
                    {w.consent_confirmed ? <Badge tone="ok">consent given</Badge> : <Badge tone="bad">no consent</Badge>}
                  </div>
                  {w.story ? <p className="mt-2 line-clamp-3 text-sm">{w.story}</p> : null}
                  {w.photos.length ? (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {w.photos.slice(0, 8).map((ph) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={ph.id} src={ph.url} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1 text-sm">
                    {w.vendors.map((v) => (
                      <Link key={v.id} href={`/v/${v.slug}`}>
                        <Badge tone={v.vendor_confirmed ? 'ok' : 'plain'}>
                          {v.business_name}
                          {v.vendor_confirmed ? '' : ' (unconfirmed)'}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                  <form action={opsTagVendor} className="mt-3 flex gap-2">
                    <input type="hidden" name="id" value={w.id} />
                    <input name="vendor_slug" className="input" placeholder="Tag another vendor (profile link)" />
                    <button className="btn btn-ghost btn-sm">Tag</button>
                  </form>
                  <form action={opsModerateWedding} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={w.id} />
                    <input name="note" className="input flex-1" placeholder="Note to the submitter (optional)" />
                    <button name="publish" value="1" className="btn btn-sm btn-gold" disabled={!w.consent_confirmed}>
                      Publish
                    </button>
                    <button name="publish" value="0" className="btn btn-sm btn-ghost">
                      Reject
                    </button>
                  </form>
                </Card>
              </li>
            ) : null
          )}
        </ul>
      ) : (
        <Empty title="Nothing to review" />
      )}
    </>
  );
}
