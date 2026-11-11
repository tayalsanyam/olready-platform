import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql, DomainError } from '@/lib/db';
import { saveCapture } from '@/lib/captures';
import { networkKey, sameSite, visitorId } from '@/lib/visitor';

/** A visitor leaves a mobile number for a call. */
export async function POST(req: Request) {
  if (!(await sameSite())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!(await networkKey())) return NextResponse.json({ ok: true });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 });
  }
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  // People never see this field; bots fill it.
  if (s(b.company)) return NextResponse.json({ ok: true });
  try {
    await saveCapture(sql, {
      phone: s(b.phone) ?? '', name: s(b.name), source: s(b.source) ?? 'dock', page: s(b.page), note: s(b.note), chatId: s(b.chatId),
      slugs: Array.isArray(b.slugs) ? b.slugs.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      townSlug: (await cookies()).get('olr_town')?.value ?? null, visitor: await visitorId(),
    });
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
