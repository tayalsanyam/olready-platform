import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { handleMetaWebhook, handleWatiWebhook, verifyMetaSignature } from '@/lib/whatsapp';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Meta's one-time webhook check: echo the challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (p.get('hub.mode') === 'subscribe' && token && same(p.get('hub.verify_token') ?? '', token)) return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  return new NextResponse('forbidden', { status: 403 });
}

/** STOP replies and delivery receipts. Meta bodies are signed with the app secret; Wati calls carry our token. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }
  if (process.env.WHATSAPP_PROVIDER === 'wati') {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!token || !same(req.nextUrl.searchParams.get('token') ?? '', token)) return new NextResponse('forbidden', { status: 403 });
    await handleWatiWebhook(sql, body as never);
    return NextResponse.json({ ok: true });
  }
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) return new NextResponse('bad signature', { status: 401 });
  await handleMetaWebhook(sql, body as never);
  return NextResponse.json({ ok: true });
}
