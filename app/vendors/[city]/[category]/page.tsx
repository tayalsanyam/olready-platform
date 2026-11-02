import { ListingPage, landingMetadata } from '@/components/Listing';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string; category: string }>; searchParams: Promise<Record<string, string | string[]>> };
const pageOf = async (sp: P['searchParams']) => {
  const n = Number((await sp).page);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

export async function generateMetadata({ params, searchParams }: P) {
  const { city, category } = await params;
  return landingMetadata(city, category, undefined, await pageOf(searchParams));
}

export default async function Page({ params, searchParams }: P) {
  const { city, category } = await params;
  return <ListingPage citySlug={city} categorySlug={category} page={await pageOf(searchParams)} />;
}
