import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { listCities } from '@/lib/catalog';
import { RealWeddingForm } from '@/components/RealWeddingForm';
import { Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Share our wedding', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function ShareWedding({ searchParams }: P) {
  const q = await searchParams;
  await requireProfile('/me/real-wedding');
  const cities = await listCities(sql);
  return (
    <>
      <PageTitle title="Share your wedding" sub="Inspire other brides and credit the vendors who made your day." />
      <Notice error={q.error} ok={q.ok} />
      <RealWeddingForm cities={cities} backPath="/me/real-wedding" />
    </>
  );
}
