import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { listCities } from '@/lib/catalog';
import { searchPages, searchVendors } from '@/lib/search';

// Typeahead for the header search: a few vendors and matching category pages, in the chosen city.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').slice(0, 60);
  const cities = await listCities(sql);
  const city = cities.find((c) => c.slug === u.searchParams.get('city')) ?? null;
  if (q.trim().length < 2) return NextResponse.json({ vendors: [], pages: [] });
  const [vendors, pages] = await Promise.all([searchVendors(sql, q, city?.id ?? null, 5), searchPages(sql, q, city ?? cities[0])]);
  return NextResponse.json(
    { vendors: vendors.map((v) => ({ slug: v.slug, name: v.business_name, sub: `${v.category_name}, ${v.city_name}` })), pages: pages.slice(0, 3) },
    { headers: { 'Cache-Control': 'public, s-maxage=60' } }
  );
}
