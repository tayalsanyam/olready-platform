import Link from 'next/link';
import { sql } from '@/lib/db';
import { publishedRealWeddings } from '@/lib/realWeddings';
import { Container, Cover, Empty, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Real weddings',
  description: 'Real weddings from Chandigarh, Mohali and Panchkula, with every vendor credited.',
  alternates: { canonical: '/real-weddings' },
};

export default async function RealWeddings() {
  const list = await publishedRealWeddings(sql, 60);
  return (
    <Container>
      <PageTitle title="Real weddings" sub="Every vendor is credited, so you can book the team behind the look." />
      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <Link key={w.id} href={`/real-weddings/${w.slug}`} className="card block overflow-hidden">
              <div className="aspect-[4/3]">
                <Cover url={w.cover_image_url} name={w.couple_names} />
              </div>
              <div className="p-3">
                <p className="font-semibold">{w.couple_names}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  {w.title}
                  {w.city_name ? ` · ${w.city_name}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No stories yet">The first real weddings are being reviewed.</Empty>
      )}
    </Container>
  );
}
