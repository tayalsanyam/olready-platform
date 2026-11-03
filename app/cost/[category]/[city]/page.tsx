import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { costEntries, costGuide, costPath, costTitle } from '@/lib/costGuide';
import { formatInr, listCities } from '@/lib/catalog';
import { CostGuidePage } from '@/components/CostGuidePage';

type P = { params: Promise<{ category: string; city: string }> };

export async function generateMetadata({ params }: P) {
  const { category, city } = await params;
  const g = await costGuide(sql, category, city);
  if (!g) return { title: 'Not found', robots: { index: false } };
  return {
    title: costTitle(g),
    description: `${g.category.plural_name} in ${g.city!.name} start from ${formatInr(g.min)} ${g.category.price_unit}; most ${formatInr(g.low)} to ${formatInr(g.high)}. Real prices from ${g.priced} OLReady vendors, updated daily.`,
    alternates: { canonical: costPath(g.category.slug, g.city!.slug) },
    robots: g.indexable ? undefined : { index: false, follow: true },
  };
}

export default async function Page({ params }: P) {
  const { category, city } = await params;
  const g = await costGuide(sql, category, city);
  if (!g) notFound();
  const entries = new Set((await costEntries(sql)).map((e) => e.path));
  const others = (await listCities(sql)).filter((c) => c.slug !== city && entries.has(costPath(category, c.slug)));
  return <CostGuidePage g={g} otherCities={others} />;
}
