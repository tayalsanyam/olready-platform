import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { suppress, verifyUnsubscribe } from '@/lib/email';

// One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header.
export async function POST(req: Request) {
  const u = new URL(req.url);
  const email = verifyUnsubscribe(u.searchParams.get('e') ?? '', u.searchParams.get('t') ?? '');
  if (!email) return new NextResponse(null, { status: 400 });
  await suppress(sql, email, 'unsubscribed', 'one-click');
  return new NextResponse(null, { status: 200 });
}
