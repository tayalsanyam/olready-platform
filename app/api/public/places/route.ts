import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { searchPlaces } from '@/lib/locations';

// Typeahead for town, area and pincode boxes. ?q=moh  ?q=160022  ?q=sector 3&city=12
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').slice(0, 60);
  const city = Number(u.searchParams.get('city')) || null;
  const places = await searchPlaces(sql, q, { cityId: city, limit: 8 });
  return NextResponse.json({ places }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
