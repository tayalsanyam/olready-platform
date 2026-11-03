import { sql } from '@/lib/db';
import { formatInr } from '@/lib/catalog';
import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'Wedding vendor on OLReady';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [v] = await sql<{ name: string; category: string; city: string; price: number | null; unit: string; verified: boolean; assured: boolean; rating: number | null; n: number }[]>`
    select v.business_name as name, c.name as category, ci.name as city, v.starting_price_inr as price, c.price_unit as unit,
      v.verified_at is not null as verified, v.assured,
      (select round(avg((rating_artist + rating_service) / 2.0), 1)::float from mkt.reviews r where r.vendor_id = v.id and r.status = 'published') as rating,
      (select count(*)::int from mkt.reviews r where r.vendor_id = v.id and r.status = 'published') as n
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    where v.slug = ${slug} and v.status = 'live'`;
  if (!v) return ogCard({ label: 'OLReady', title: 'Wedding vendors we have checked first' });
  return ogCard({
    label: `${v.category} in ${v.city}`,
    title: v.name,
    badge: v.assured ? 'OLReady Assured' : v.verified ? 'Verified' : undefined,
    facts: [v.price != null ? `From ${formatInr(v.price)} ${v.unit}` : 'Price on request', v.n ? `★ ${v.rating?.toFixed(1)} from ${v.n} review${v.n === 1 ? '' : 's'}` : 'Get a quote on OLReady'],
  });
}
