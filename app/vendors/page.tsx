import Link from 'next/link';
import { sql } from '@/lib/db';
import { listCategories, listCities } from '@/lib/catalog';
import { Container, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Wedding vendors',
  description: 'Browse verified wedding vendors by city and category.',
  alternates: { canonical: '/vendors' },
};

export default async function VendorsIndex() {
  const [cities, cats] = await Promise.all([listCities(sql), listCategories(sql, { activeOnly: true })]);
  return (
    <Container>
      <PageTitle title="Wedding vendors" sub="Choose a city, then a category." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((city) => (
          <div key={city.slug} className="card p-4">
            <h2 className="font-semibold">
              <Link href={`/vendors/${city.slug}`}>{city.name}</Link>
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/vendors/${city.slug}/${c.slug}`} className="underline-offset-4 hover:underline">
                    {c.plural_name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Container>
  );
}
