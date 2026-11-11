import { sql } from '@/lib/db';
import { formatInr } from '@/lib/catalog';
import { costGuide, costTitle } from '@/lib/costGuide';
import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'Wedding prices on Olready';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ category: string; city: string }> }) {
  const { category, city } = await params;
  const g = await costGuide(sql, category, city);
  if (!g) return ogCard({ label: 'Olready', title: 'Wedding costs in India' });
  return ogCard({ label: 'Real prices from listed vendors', title: costTitle(g), facts: [`From ${formatInr(g.min)}`, `Most ${formatInr(g.low)} to ${formatInr(g.high)}`, g.category.price_unit] });
}
