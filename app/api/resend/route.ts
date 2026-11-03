import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { suppress } from '@/lib/email';

/**
 * Resend delivery webhook (signed with Svix). A hard bounce or a spam complaint stops all email
 * to that address at once; soft bounces do after three in 30 days.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse('not configured', { status: 503 });
  const body = await req.text();
  if (body.length > 262144) return new NextResponse(null, { status: 413 });
  const id = req.headers.get('svix-id') ?? '';
  const ts = req.headers.get('svix-timestamp') ?? '';
  const sigs = (req.headers.get('svix-signature') ?? '').split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new NextResponse(null, { status: 401 });
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) return new NextResponse(null, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } } };
  const to = ([] as string[]).concat(event.data?.to ?? []).map((e) => e.toLowerCase());
  const type = event.type ?? '';
  for (const email of to) {
    const detail = [event.data?.bounce?.type, event.data?.bounce?.subType, event.data?.bounce?.message].filter(Boolean).join(': ');
    await sql`insert into mkt.email_events (email, type, detail) values (${email}, ${type}, ${detail.slice(0, 500)})`;
    if (type === 'email.complained') await suppress(sql, email, 'complaint', detail);
    if (type === 'email.bounced') {
      const hard = /permanent|hard/i.test(event.data?.bounce?.type ?? '') || !event.data?.bounce?.type;
      if (hard) await suppress(sql, email, 'hard_bounce', detail);
      else {
        const [{ n }] = await sql<{ n: number }[]>`
          select count(*)::int as n from mkt.email_events where email = ${email} and type = 'email.bounced' and created_at > now() - interval '30 days'`;
        if (n >= 3) await suppress(sql, email, 'soft_bounce', detail);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
