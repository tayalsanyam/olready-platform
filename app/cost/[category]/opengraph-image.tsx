import { sql } from '@/lib/db';
import { formatInr } from '@/lib/catalog';
import { costGuide, costTitle } from '@/lib/costGuide';
import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'Wedding prices on OLReady';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const g = await costGuide(sql, category, null);
  if (!g) return ogCard({ label: 'OLReady', title: 'Wedding costs in India' });
  return ogCard({ label: 'Real prices from listed vendors', title: costTitle(g), facts: [`From ${formatInr(g.min)}`, `Most ${formatInr(g.low)} to ${formatInr(g.high)}`, g.category.price_unit] });
}
