import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recordBoostVisit } from '@/lib/promotion';
import { visitorKey } from '@/lib/analytics';

// A Sponsored card was opened: charge the Boost once per visitor per day, then go to the profile.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const placement = new URL(req.url).searchParams.get('p') ?? 'search';
  const visitor = await visitorKey();
  const slug = await recordBoostVisit(sql, id, visitor, placement);
  if (!slug) return NextResponse.redirect(new URL('/vendors', req.url));
  return NextResponse.redirect(new URL(`/v/${slug}?ref=sponsored`, req.url), 302);
}
