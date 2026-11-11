import { calendarDaily, freshness, todayIst } from '@/lib/availability';
import { queueEmail } from '@/lib/email';
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { expireDisputes } from '@/lib/reviews';
import { flushWhatsApp } from '@/lib/whatsapp';
import { purgeOldChats } from '@/lib/brideAssistant';
import { flushOutbox, queuePostEventFeedback } from '@/lib/email';
import { endExpiredEngagements } from '@/lib/rm';
import { expirePlans } from '@/lib/payments';
import { endFinishedBoosts } from '@/lib/promotion';
import { queueBrideCheckins } from '@/lib/automations';
import { queuePlanNudges } from '@/lib/alerts';

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
  const plans = await expirePlans(sql);
  const rmEnded = await endExpiredEngagements(sql);
  const boostsEnded = await endFinishedBoosts(sql);
  const checkins = await queueBrideCheckins(sql);
  const planNudges = await queuePlanNudges(sql);
  const mail = await flushOutbox(sql);
  const whatsapp = await flushWhatsApp(sql, 200);
  const chatsDeleted = await purgeOldChats(sql);
  await (await import('@/lib/errors')).purgeOldErrors(sql);
  const calendars = await calendarDaily(sql, async (vendorId) => {
    const [v] = await sql<{ email: string | null; business: string; updated: Date | null }[]>`
      select coalesce(p.email, v.email) as email, v.business_name as business, v.calendar_updated_at as updated
      from mkt.vendors v left join mkt.profiles p on p.id = v.owner_profile_id where v.id = ${vendorId} and coalesce(p.notify_email, true)`;
    if (v?.email) await queueEmail(sql, v.email, 'calendar_reminder', { business: v.business, ago: freshness(v.updated, 0).ago ?? 'never' }, `calendar:${vendorId}:${todayIst().slice(0, 7)}`);
  });
  return NextResponse.json({ expiredDisputes: expired, feedbackQueued: feedback, expiredPlans: plans, rmEnded, boostsEnded, checkins, planNudges, mail, whatsapp, chatsDeleted, calendars });
}
