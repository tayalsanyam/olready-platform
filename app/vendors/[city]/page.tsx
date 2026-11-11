import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCityBySlug, listCategories } from '@/lib/catalog';
import { countVendors } from '@/lib/vendors';
import { Container, PageTitle } from '@/components/ui';
import { BannerStrip } from '@/components/BannerStrip';
import { RememberTown } from '@/components/RememberTown';
import { NationalHub, nationalMetadata } from '@/components/NationalListing';
import { liveBanners } from '@/lib/promotion';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P) {
  if ((await params).city === 'india') return nationalMetadata();
  const city = await getCityBySlug(sql, (await params).city);
  if (!city) return { title: 'Not found' };
  const total = await countVendors(sql, { cityId: city.id });
  return {
    title: `Wedding vendors in ${city.name}`,
    description: `Verified wedding venues, caterers, bridal makeup artists, photographers, decorators and more in ${city.name}, ${city.state}. Compare prices and get quotes on Olready.`,
    alternates: { canonical: `/vendors/${city.slug}` },
    robots: total >= 3 ? undefined : { index: false, follow: true },
  };
}

export default async function CityPage({ params }: P) {
  if ((await params).city === 'india') return <NationalHub />;
  const city = await getCityBySlug(sql, (await params).city);
  if (!city) notFound();
  const cats = await listCategories(sql, { activeOnly: true });
  const counts = await Promise.all(cats.map((c) => countVendors(sql, { categoryId: c.id, cityId: city.id })));
  const banners = await liveBanners(sql, 'city', city.id);
  return (
    <Container>
      <RememberTown slug={city.slug} />
      <PageTitle title={`Wedding vendors in ${city.name}`} sub="Pick a category to compare verified vendors and prices." />
      <div className="mb-6">
        <BannerStrip banners={banners} />
      </div>
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
