import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { costGuide, costPath, costTitle, costTowns } from '@/lib/costGuide';
import { formatInr } from '@/lib/catalog';
import { CostGuidePage } from '@/components/CostGuidePage';

type P = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: P) {
  const { category } = await params;
  const g = await costGuide(sql, category, null);
  if (!g) return { title: 'Not found', robots: { index: false } };
  return {
    title: costTitle(g),
    description: `What ${g.category.plural_name.toLowerCase()} cost in India: from ${formatInr(g.min)}, most ${formatInr(g.low)} to ${formatInr(g.high)} ${g.category.price_unit}, from ${g.priced} listed vendors.`,
    alternates: { canonical: costPath(g.category.slug) },
    robots: g.indexable ? undefined : { index: false, follow: true },
  };
}

export default async function Page({ params }: P) {
  const { category } = await params;
  const g = await costGuide(sql, category, null);
  if (!g) notFound();
  const others = await costTowns(sql, category);
  return <CostGuidePage g={g} otherCities={others} />;
}
