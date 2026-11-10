import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { handleMetaLeadWebhook } from '@/lib/leadIntake';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Meta's one-time check when the webhook is added. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.META_LEADS_VERIFY_TOKEN;
  if (p.get('hub.mode') === 'subscribe' && token && same(p.get('hub.verify_token') ?? '', token)) return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  return new NextResponse('forbidden', { status: 403 });
}

/** A new lead from an Instagram or Facebook lead form. The body is signed with the app secret. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  const header = req.headers.get('x-hub-signature-256');
  if (!secret || !header?.startsWith('sha256=')) return new NextResponse('bad signature', { status: 401 });
  const want = createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse('bad signature', { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }
  await handleMetaLeadWebhook(sql, body as never);
  return NextResponse.json({ ok: true });
}
