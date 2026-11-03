import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { queueEventEve } from '@/lib/automations';
import { flushOutbox } from '@/lib/email';

// 18:00 IST: reminders for tomorrow's functions.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('unauthorized', { status: 401 });
  const eve = await queueEventEve(sql);
  const mail = await flushOutbox(sql);
  return NextResponse.json({ eventEve: eve, mail });
}
