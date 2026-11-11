import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { writeReviewAction } from '@/lib/actions/bride';
import { Card, Empty, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reviews', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function BrideReviews({ searchParams }: P) {
  const q = await searchParams;
  const p = await requireProfile('/me/reviews');
  const vendors = await sql<{ vendor_id: string; slug: string; business_name: string; category_name: string; booked: boolean; reviewed: boolean }[]>`
    select distinct on (v.id) v.id as vendor_id, v.slug, v.business_name, c.name as category_name,
      (ln.booked_vendor_id = v.id) as booked,
      exists (select 1 from mkt.reviews r where r.vendor_id = v.id and r.author_profile_id = ${p.id}) as reviewed
    from mkt.threads t
    join mkt.lead_needs ln on ln.id = t.lead_need_id
    join mkt.leads l on l.id = ln.lead_id
    join mkt.vendors v on v.id = t.vendor_id
    join mkt.categories c on c.id = v.category_id
    where l.bride_profile_id = ${p.id}
       or exists (select 1 from mkt.wedding_members m where m.wedding_id = l.wedding_id and m.profile_id = ${p.id})
    order by v.id, booked desc`;
  const focus = sp(q.vendor);
  vendors.sort((a, b) => Number(b.slug === focus) - Number(a.slug === focus) || Number(b.booked) - Number(a.booked));
  return (
    <>
      <PageTitle title="Reviews" sub="Rate the artist and the service separately. Reviews from bookings show a verified tag." />
      <Notice error={q.error} ok={q.ok} />
      {vendors.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {vendors.map((v) => (
            <Card key={v.vendor_id}>
              <h2 className="font-semibold">{v.business_name}</h2>
              <p className="hint">
                {v.category_name}
                {v.booked ? ' · you booked them' : ''}
                {v.reviewed ? ' · reviewed (saving again updates it)' : ''}
              </p>
              <form action={writeReviewAction} className="mt-3 space-y-2">
                <input type="hidden" name="vendor_id" value={v.vendor_id} />
                {(['rating_artist', 'rating_service'] as const).map((k) => (
                  <fieldset key={k} className="flex items-center justify-between gap-2">
                    <legend className="sr-only">{k === 'rating_artist' ? 'Artist' : 'Service'}</legend>
                    <span className="text-sm">{k === 'rating_artist' ? 'Their work' : 'Service and punctuality'}</span>
                    <span className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className="cursor-pointer text-sm">
                          <input type="radio" name={k} value={n} required className="peer sr-only" />
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] peer-checked:border-[var(--color-pink)] peer-checked:bg-[var(--color-pink)] peer-checked:text-white">
                            {n}
                          </span>
                        </label>
                      ))}
                    </span>
                  </fieldset>
                ))}
                <textarea name="body" rows={3} className="input" placeholder="What should other brides know?" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="block text-[var(--color-muted)]">What you spent (optional)</span>
                    <input name="amount_spent" inputMode="numeric" className="input" placeholder="₹" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-[var(--color-muted)]">Function date (optional)</span>
                    <input name="function_date" type="date" className="input" />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="block text-[var(--color-muted)]">Photos (up to 5, optional)</span>
                  <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
                </label>
                <p className="hint">What you spent is shown with your review as a price guide for other families.</p>
                <button className="btn btn-sm">Save review</button>
              </form>
            </Card>
          ))}
        </div>
      ) : (
        <Empty art="stars" title="No vendors to review yet">Vendors you talk to through Olready appear here.</Empty>
      )}
    </>
  );
}
