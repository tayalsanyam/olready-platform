import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { costEntries, costGuide, costPath, costTitle } from '@/lib/costGuide';
import { formatInr, listCities } from '@/lib/catalog';
import { CostGuidePage } from '@/components/CostGuidePage';

type P = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: P) {
  const { category } = await params;
  const g = await costGuide(sql, category, null);
  if (!g) return { title: 'Not found', robots: { index: false } };
  return {
    title: costTitle(g),
    description: `What ${g.category.plural_name.toLowerCase()} cost in Chandigarh, Mohali and Panchkula: from ${formatInr(g.min)}, most ${formatInr(g.low)} to ${formatInr(g.high)} ${g.category.price_unit}, from ${g.priced} listed vendors.`,
    alternates: { canonical: costPath(g.category.slug) },
    robots: g.indexable ? undefined : { index: false, follow: true },
  };
}

export default async function Page({ params }: P) {
  const { category } = await params;
  const g = await costGuide(sql, category, null);
  if (!g) notFound();
  const entries = new Set((await costEntries(sql)).map((e) => e.path));
  const others = (await listCities(sql)).filter((c) => entries.has(costPath(category, c.slug)));
  return <CostGuidePage g={g} otherCities={others} />;
}
