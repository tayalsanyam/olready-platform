import { NextResponse, type NextRequest } from 'next/server';

/** Home search form target: sends the visitor to the clean landing-page URL. */
export function GET(req: NextRequest) {
  const slug = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const city = slug(req.nextUrl.searchParams.get('city'));
  const category = slug(req.nextUrl.searchParams.get('category'));
  const to = city && category ? `/vendors/${city}/${category}` : '/vendors';
  return NextResponse.redirect(new URL(to, req.url), 303);
}
