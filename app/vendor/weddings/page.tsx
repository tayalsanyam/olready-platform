import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { listCities } from '@/lib/catalog';
import { confirmTagAction } from '@/lib/actions/vendor';
import { RealWeddingForm } from '@/components/RealWeddingForm';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Real weddings', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function VendorWeddings({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/weddings');
  const [cities, tagged] = await Promise.all([
    listCities(sql),
    sql<{ id: string; slug: string; title: string; couple_names: string; status: string; vendor_confirmed: boolean }[]>`
      select rw.id, rw.slug, rw.title, rw.couple_names, rw.status, rwv.vendor_confirmed
      from mkt.real_wedding_vendors rwv join mkt.real_weddings rw on rw.id = rwv.real_wedding_id
      where rwv.vendor_id = ${vendor.id} order by rw.created_at desc`,
  ]);
  return (
    <>
      <PageTitle title="Real weddings" sub="Weddings you are tagged in link to your profile." />
      <Notice error={q.error} ok={q.ok} />
      {tagged.length ? (
        <Card className="mb-6">
          <ul className="divide-y divide-[var(--color-line)]">
            {tagged.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  {t.status === 'published' ? (
                    <Link href={`/real-weddings/${t.slug}`} className="font-semibold underline-offset-4 hover:underline">
                      {t.couple_names}
                    </Link>
                  ) : (
                    <span className="font-semibold">{t.couple_names}</span>
                  )}
                  <div className="hint">
                    {t.title} · {t.status}
                  </div>
                </div>
                {t.vendor_confirmed ? (
                  <Badge tone="ok">Confirmed</Badge>
                ) : (
                  <form action={confirmTagAction}>
                    <input type="hidden" name="real_wedding_id" value={t.id} />
                    <input type="hidden" name="_back" value="/vendor/weddings" />
                    <button className="btn btn-sm">I worked on this</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <RealWeddingForm cities={cities} backPath="/vendor/weddings" defaultVendorSlug={vendor.slug} />
    </>
  );
}
