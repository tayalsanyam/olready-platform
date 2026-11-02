import { ListingPage, landingMetadata } from '@/components/Listing';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string; category: string; filter: string }> };

export async function generateMetadata({ params }: P) {
  const { city, category, filter } = await params;
  return landingMetadata(city, category, filter);
}

export default async function Page({ params }: P) {
  const { city, category, filter } = await params;
  return <ListingPage citySlug={city} categorySlug={category} filterSlug={filter} />;
}
