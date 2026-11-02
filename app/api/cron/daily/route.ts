import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { expireDisputes } from '@/lib/reviews';
import { flushOutbox, queuePostEventFeedback } from '@/lib/email';

/**
 * Daily jobs (Vercel Cron, Authorization: Bearer $CRON_SECRET):
 * expire disputes past their proof window, queue post-event feedback, send queued email,
 * and expire plan subscriptions past their end date.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const expired = await expireDisputes(sql);
  const feedback = await queuePostEventFeedback(sql);
  const subs = await sql`update mkt.vendor_subscriptions set status = 'expired' where status = 'active' and ends_at < now() returning id`;
  const mail = await flushOutbox(sql);
  return NextResponse.json({ expiredDisputes: expired, feedbackQueued: feedback, expiredPlans: subs.length, mail });
}
