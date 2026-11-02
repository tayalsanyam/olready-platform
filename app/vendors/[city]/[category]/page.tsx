import { ListingPage, landingMetadata } from '@/components/Listing';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string; category: string }> };

export async function generateMetadata({ params }: P) {
  const { city, category } = await params;
  return landingMetadata(city, category);
}

export default async function Page({ params }: P) {
  const { city, category } = await params;
  return <ListingPage citySlug={city} categorySlug={category} />;
}
