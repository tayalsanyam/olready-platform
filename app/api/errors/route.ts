import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { recordError } from '@/lib/errors';

// Browsers report their own crashes here. Small, same-site only, and capped per visitor.
const seen = new Map<string, { n: number; at: number }>();

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return new NextResponse(null, { status: 204 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
  const now = Date.now();
  const s = seen.get(ip);
  if (s && now - s.at < 60_000) {
    if (s.n >= 10) return new NextResponse(null, { status: 204 });
    s.n++;
  } else {
    if (seen.size > 5000) seen.clear();
    seen.set(ip, { n: 1, at: now });
  }
  const raw = await req.text();
  if (raw.length > 12_000) return new NextResponse(null, { status: 204 });
  let b: { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  if (!str(b.message)) return new NextResponse(null, { status: 204 });
  await recordError(sql, { kind: 'client', message: str(b.message)!, stack: str(b.stack), path: str(b.path), digest: str(b.digest), userAgent: req.headers.get('user-agent') });
  return new NextResponse(null, { status: 204 });
}
