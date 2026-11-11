import { NextResponse } from 'next/server';
import { sql, DomainError } from '@/lib/db';
import { askVisitor } from '@/lib/brideAssistant';
import { networkKey, sameSite, visitorId } from '@/lib/visitor';

export const maxDuration = 60;

/** One question to the helper from a visitor who is not signed in. */
export async function POST(req: Request) {
  if (!(await sameSite())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const ip = await networkKey();
  if (!ip) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  let b: { text?: unknown; chatId?: unknown; page?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Type a question' }, { status: 400 });
  }
  try {
    const r = await askVisitor(sql, { visitor: await visitorId(), ipKey: ip, chatId: typeof b.chatId === 'string' ? b.chatId : null, text: typeof b.text === 'string' ? b.text : '', page: typeof b.page === 'string' ? b.page : null });
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'limit' ? 429 : 400 });
    throw e;
  }
}
