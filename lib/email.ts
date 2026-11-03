import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';

export type EmailTemplate =
  | 'post_event_feedback'
  | 'lead_verified'
  | 'claim_invite'
  | 'booking_confirmed'
  | 'vendor_new_lead'
  | 'new_message'
  | 'quote_received'
  | 'quote_accepted'
  | 'rm_assigned'
  | 'review_request'
  | 'callback_booked'
  | 'banner_approved'
  | 'banner_rejected'
  | 'event_eve_bride'
  | 'event_eve_vendor'
  | 'checkin_7'
  | 'still_looking_15'
  | 'newsletter_welcome';

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Queues an email. dedupeKey makes repeated cron runs safe. */
export async function queueEmail(
  db: Db,
  to: string,
  template: EmailTemplate,
  payload: Record<string, unknown>,
  dedupeKey?: string
) {
  await db`
    insert into mkt.email_outbox (to_email, template, payload, dedupe_key)
    values (${to}, ${template}, ${db.json(payload as never)}, ${dedupeKey ?? null})
    on conflict (dedupe_key) do nothing`;
}

function render(template: EmailTemplate, p: Record<string, string>) {
  switch (template) {
    case 'post_event_feedback':
      return {
        subject: `How was ${p.vendor} at your wedding?`,
        text: `Hi ${p.name},\n\nWe hope the wedding went beautifully. Tell other brides how ${p.vendor} did: rate the artist and the service.\n\n${site()}/me/reviews?vendor=${p.vendorSlug}\n\nIf anything went wrong, reply to this email and our support team will help.\n\nOLReady`,
      };
    case 'lead_verified':
      return {
        subject: 'Your enquiry is verified',
        text: `Hi ${p.name},\n\nThanks for confirming your details. Verified vendors can now reach out, and you can chat and compare quotes here:\n\n${site()}/me\n\nOLReady`,
      };
    case 'claim_invite':
      return {
        subject: `Claim your ${p.business} profile on OLReady`,
        text: `Hello,\n\nWe have prepared a profile for ${p.business} on OLReady. It stays private until you claim it and check the details:\n\n${site()}/claim/${p.token}\n\nOLReady`,
      };
    case 'vendor_new_lead':
      return {
        subject: `New verified ${p.category} lead in ${p.city}`,
        text: `Hello ${p.business},\n\nA verified bride in ${p.city} needs a ${p.category}${p.date ? ` for ${p.date}` : ''}. It is shared with a limited number of vendors.\n\nSee it and unlock it here:\n${site()}/vendor\n\nOLReady`,
      };
    case 'new_message':
      return {
        subject: `New message from ${p.from}`,
        text: `Hi ${p.name},\n\n${p.from} sent you a message on OLReady:\n\n"${p.preview}"\n\nReply here: ${site()}${p.path}\n\nOLReady`,
      };
    case 'quote_received':
      return {
        subject: `${p.vendor} sent you a quote`,
        text: `Hi ${p.name},\n\n${p.vendor} quoted ${p.amount} for your ${p.category}. Compare and accept it here:\n\n${site()}${p.path}\n\nOLReady`,
      };
    case 'quote_accepted':
      return {
        subject: `${p.bride} accepted your quote`,
        text: `Hello ${p.business},\n\n${p.bride} accepted your quote of ${p.amount}. Confirm the details with her, and report the booking on OLReady to get your bonus credit:\n\n${site()}${p.path}\n\nOLReady`,
      };
    case 'rm_assigned':
      return {
        subject: 'Your OLReady relationship manager',
        text: `Hi ${p.name},\n\n${p.rm} is your relationship manager and will call you within one working day. Details are here:\n\n${site()}/me/rm\n\nOLReady`,
      };
    case 'review_request':
      return {
        subject: `${p.vendor} asked for your review`,
        text: `Hi ${p.name},\n\n${p.vendor} would love to hear how your wedding went. It takes a minute: rate the work and the service, and add a line if you like.\n\n${site()}/review/${p.token}\n\nYou sign in with a code sent to this email, so only you can use this link. If you did not book ${p.vendor}, ignore this email.\n\nOLReady`,
      };
    case 'banner_approved':
      return {
        subject: 'Your banner is approved',
        text: `Hi ${p.name},\n\nYour OLReady banner is approved and will show for the month you booked.\n\n${site()}/vendor/promote\n\nOLReady`,
      };
    case 'banner_rejected':
      return {
        subject: 'Your banner needs changes',
        text: `Hi ${p.name},\n\nWe could not approve your banner: ${p.reason}\n\nThe full amount is back in your ads wallet. You can book again with a new image or headline:\n\n${site()}/vendor/promote\n\nOLReady`,
      };
    case 'event_eve_bride':
      return {
        subject: `Tomorrow: ${p.events}`,
        text: `Hi ${p.name},\n\nTomorrow is a big day: ${p.events}.\n\n${p.details}\n\nYour booked vendors:\n${p.vendors}\n\nEverything is in one place here:\n${site()}/me\n\nWishing you the happiest day.\nOLReady`,
      };
    case 'event_eve_vendor':
      return {
        subject: `Tomorrow: ${p.bride}'s ${p.events}`,
        text: `Hi ${p.name},\n\nA reminder for your booking with ${p.bride} tomorrow:\n\n${p.details}\n\nPhone: ${p.phone}\n\nThe conversation is here:\n${site()}/vendor/threads\n\nOLReady`,
      };
    case 'checkin_7':
      return {
        subject: 'How are your quotes looking?',
        text: `Hi ${p.name},\n\nIt has been a week since we verified your request. Compare the quotes you have side by side, and ask vendors anything before you decide:\n\n${site()}/me/compare\n\nIf you want more options, reply to this email and our team will help.\n\nOLReady`,
      };
    case 'still_looking_15':
      return {
        subject: 'Still looking for the right vendors?',
        text: `Hi ${p.name},\n\nWe have not heard from you in a while. If you are still looking, tell us what is missing and we will ask more verified vendors to quote. If you have booked, tell us so we stop sending requests:\n\n${site()}/me\n\nOLReady`,
      };
    case 'callback_booked':
      return {
        subject: 'We will call you',
        text: `Hi ${p.name},\n\nThanks. Someone from OLReady will call you on ${p.phone}${p.when ? ` (${p.when})` : ''} about ${p.topic}. Support hours are Monday to Saturday, 10:00 to 18:30.\n\nOLReady`,
      };
    case 'newsletter_welcome':
      return {
        subject: 'Wedding ideas from OLReady',
        text: `Thanks for signing up. We will send you new ideas, real Tricity weddings and planning guides now and then.\n\nStart here: ${site()}/blog\n\nTo stop these emails: ${site()}/unsubscribe/${p.token}\n\nOLReady`,
      };
    case 'booking_confirmed':
      return {
        subject: 'Booking recorded',
        text: `Hi ${p.name},\n\nThanks for telling us about your booking with ${p.vendor}. Your reward is in your account.\n\nOLReady`,
      };
  }
}

/** Sends due emails through Resend. Without an API key, emails stay queued (local development). */
export async function flushOutbox(db: Db, limit = 50) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, skipped: true };
  const due = await db<{ id: string; to_email: string; template: EmailTemplate; payload: Record<string, string> }[]>`
    select id, to_email, template, payload from mkt.email_outbox
    where sent_at is null and send_after <= now() and (error is null or created_at > now() - interval '1 day')
    order by created_at limit ${limit}`;
  let sent = 0;
  for (const m of due) {
    // Never email an address that bounced, complained or unsubscribed.
    const [blocked] = await db`select reason from mkt.email_suppressions where email = ${m.to_email.toLowerCase()}`;
    if (blocked) {
      await db`update mkt.email_outbox set sent_at = now(), error = ${`suppressed: ${blocked.reason}`} where id = ${m.id}`;
      continue;
    }
    const { subject, text } = render(m.template, m.payload);
    const unsub = unsubscribeUrl(m.to_email);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? 'OLReady <care@olready.in>',
          to: m.to_email,
          subject,
          text: `${text}\n\n--\nStop emails from OLReady: ${unsub}`,
          headers: { 'List-Unsubscribe': `<${unsub.replace('/unsubscribe/email', '/api/unsubscribe')}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      await db`update mkt.email_outbox set sent_at = now(), error = null where id = ${m.id}`;
      sent++;
    } catch (e) {
      await db`update mkt.email_outbox set error = ${String(e)} where id = ${m.id}`;
    }
  }
  return { sent, skipped: false };
}

/** Queues feedback emails for booked categories whose event date has passed. */
export async function queuePostEventFeedback(db: Db) {
  const rows = await db<{ need_id: string; email: string; name: string; vendor: string; vendor_slug: string }[]>`
    select ln.id as need_id, coalesce(p.email, l.email) as email, l.bride_name as name,
           v.business_name as vendor, v.slug as vendor_slug
    from mkt.lead_needs ln
    join mkt.leads l on l.id = ln.lead_id
    join mkt.vendors v on v.id = ln.booked_vendor_id
    left join mkt.profiles p on p.id = l.bride_profile_id
    where ln.status = 'closed_booked' and l.event_date is not null
      and l.event_date between current_date - 14 and current_date - 1
      and coalesce(p.email, l.email) is not null`;
  for (const r of rows) {
    await queueEmail(
      db,
      r.email,
      'post_event_feedback',
      { name: r.name.split(' ')[0], vendor: r.vendor, vendorSlug: r.vendor_slug },
      `feedback:${r.need_id}`
    );
  }
  return rows.length;
}

// ---------------------------------------------------------------- unsubscribe and suppression
const unsubSecret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? 'olready-dev';
const b64 = (s: string) => Buffer.from(s).toString('base64url');

/** A signed link that unsubscribes this address without a sign-in; it cannot be forged for another address. */
export function unsubscribeToken(email: string) {
  return createHmac('sha256', unsubSecret()).update(email.trim().toLowerCase()).digest('base64url').slice(0, 32);
}
export function unsubscribeUrl(email: string) {
  return `${site()}/unsubscribe/email?e=${b64(email.trim().toLowerCase())}&t=${unsubscribeToken(email)}`;
}
export function verifyUnsubscribe(e: string, t: string) {
  let email = '';
  try {
    email = Buffer.from(e, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const want = Buffer.from(unsubscribeToken(email));
  const got = Buffer.from(t);
  return email.includes('@') && want.length === got.length && timingSafeEqual(want, got) ? email : null;
}

export async function suppress(db: Db, email: string, reason: 'hard_bounce' | 'complaint' | 'soft_bounce' | 'unsubscribed', detail = '') {
  await db`
    insert into mkt.email_suppressions (email, reason, detail) values (${email.trim().toLowerCase()}, ${reason}, ${detail.slice(0, 300)})
    on conflict (email) do nothing`;
}
