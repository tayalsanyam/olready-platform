import { sql } from '@/lib/db';
import { formatInr, getCategoryBySlug, getCityBySlug } from '@/lib/catalog';
import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'Wedding vendors on Olready';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ city: string; category: string }> }) {
  const { city: citySlug, category: catSlug } = await params;
  const [city, cat] = await Promise.all([getCityBySlug(sql, citySlug), getCategoryBySlug(sql, catSlug)]);
  if (!city || !cat) return ogCard({ label: 'Olready', title: 'Wedding vendors we have checked first' });
  const [s] = await sql<{ n: number; min: number | null; verified: number }[]>`
    select count(*)::int as n, min(starting_price_inr)::int as min, count(*) filter (where verified_at is not null)::int as verified
    from mkt.vendors v where v.status = 'live' and v.category_id = ${cat.id} and (v.city_id = ${city.id} or ${city.id} = any(v.service_city_ids))`;
  return ogCard({
    label: 'Compare prices, photos and reviews',
    title: `${cat.plural_name} in ${city.name}`,
    facts: [`${s.n} listed`, ...(s.verified ? [`${s.verified} verified`] : []), ...(s.min ? [`From ${formatInr(s.min)} ${cat.price_unit}`] : [])],
  });
}
