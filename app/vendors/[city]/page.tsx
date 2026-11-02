import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCityBySlug, listCategories } from '@/lib/catalog';
import { countVendors } from '@/lib/vendors';
import { Container, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P) {
  const city = await getCityBySlug(sql, (await params).city);
  if (!city) return { title: 'Not found' };
  return {
    title: `Wedding vendors in ${city.name}`,
    description: `Verified bridal makeup artists, photographers, decorators, mehendi artists and DJs in ${city.name}.`,
    alternates: { canonical: `/vendors/${city.slug}` },
  };
}

export default async function CityPage({ params }: P) {
  const city = await getCityBySlug(sql, (await params).city);
  if (!city) notFound();
  const cats = await listCategories(sql, { activeOnly: true });
  const counts = await Promise.all(cats.map((c) => countVendors(sql, { categoryId: c.id, cityId: city.id })));
  return (
    <Container>
      <PageTitle title={`Wedding vendors in ${city.name}`} sub="Pick a category to compare verified vendors and prices." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c, i) => (
          <Link key={c.slug} href={`/vendors/${city.slug}/${c.slug}`} className="card block p-4 hover:shadow-md">
            <h2 className="font-semibold">{c.plural_name}</h2>
            <p className="text-sm text-[var(--color-muted)]">{counts[i]} listed</p>
          </Link>
        ))}
      </div>
    </Container>
  );
}
