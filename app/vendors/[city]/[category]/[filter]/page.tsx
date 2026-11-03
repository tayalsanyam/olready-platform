import { ListingPage, landingMetadata } from '@/components/Listing';
import { SORTS, type SortKey } from '@/lib/vendors';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string; category: string; filter: string }>; searchParams: Promise<Record<string, string | string[]>> };
const pageOf = async (sp: P['searchParams']) => {
  const n = Number((await sp).page);
  return Number.isInteger(n) && n > 1 ? n : 1;
};
const sortOf = async (sp: P['searchParams']): Promise<SortKey> => {
  const s = String((await sp).sort ?? '');
  return SORTS.some((x) => x.key === s) ? (s as SortKey) : 'recommended';
};

const ratingOf = async (sp: P['searchParams']) => (String((await sp).rating ?? '') === '4' ? 4 : null);
/** ?date=2027-02-14 keeps vendors whose calendar is free that day. */
const dateOf = async (sp: P['searchParams']) => {
  const d = String((await sp).date ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
};

export async function generateMetadata({ params, searchParams }: P) {
  const { city, category, filter } = await params;
  return landingMetadata(city, category, filter, await pageOf(searchParams));
}

export default async function Page({ params, searchParams }: P) {
  const { city, category, filter } = await params;
  return <ListingPage citySlug={city} categorySlug={category} filterSlug={filter} page={await pageOf(searchParams)} sort={await sortOf(searchParams)} minRating={await ratingOf(searchParams)} freeOn={await dateOf(searchParams)} />;
}
