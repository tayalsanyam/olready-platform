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
  | 'refund_issued'
  | 'newsletter_welcome'
  | 'contact_received'
  | 'calendar_reminder'
  | 'request_received'
  | 'booking_recorded_vendor'
  | 'vendor_profile_live'
  | 'vendor_profile_back'
  | 'vendor_profile_paused'
  | 'claim_approved'
  | 'claim_rejected'
  | 'payment_received'
  | 'plan_started'
  | 'credits_low'
  | 'plan_usage_low'
  | 'review_received'
  | 'dispute_update'
  | 'staff_alert';

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
        text: `Hi ${p.name},\n\nThanks for confirming your details. Verified vendors can now reach out. To chat with them and compare quotes, sign in with this email address (we send a code, there is no password):\n\n${site()}/login\n\nOLReady`,
      };
    case 'claim_invite':
      return {
        subject: `Claim your ${p.business} profile on OLReady`,
        text: `Hello,\n\nWe have prepared a profile for ${p.business} on OLReady. It stays private until you claim it and check the details:\n\n${site()}/claim/${p.token}\n\nOLReady`,
      };
    case 'calendar_reminder':
      return {
        subject: `Is your OLReady calendar up to date, ${p.business}?`,
        text: `Hello ${p.business},\n\nBrides on OLReady can check your dates before they send a request. Your calendar was last updated ${p.ago}, so brides now see "not marked" instead of "free".\n\nMark the days you are booked, or tap "My calendar is up to date":\n${site()}/vendor/calendar\n\nYou can also connect your Google Calendar so this happens on its own.\n\nOLReady`,
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
    case 'refund_issued':
      return {
        subject: `Refund of ₹${p.amount} for order ${p.order}`,
        text: `Hi ${p.name},\n\nWe have refunded ₹${p.amount} for order ${p.order}. Card and UPI refunds usually reach you in 5 to 7 working days, depending on your bank.\n\nQuestions? Reply to this email.\n\nOLReady`,
      };
    case 'callback_booked':
      return {
        subject: 'We will call you',
        text: `Hi ${p.name},\n\nThanks. Someone from OLReady will call you on ${p.phone}${p.when ? ` (${p.when})` : ''} about ${p.topic}. Support hours are Monday to Saturday, 10:00 to 18:30.\n\nOLReady`,
      };
    case 'contact_received':
      return {
        subject: `Contact form: ${p.topic} from ${p.name}`,
        text: `A message came in on the OLReady contact page.\n\nFrom: ${p.name}\nEmail: ${p.email || '-'}\nPhone: ${p.phone || '-'}\nAbout: ${p.topic}\n\n${p.message}\n\nReply and mark it done in Ops: ${site()}/ops\n`,
      };
    case 'newsletter_welcome':
      return {
        subject: 'Wedding ideas from OLReady',
        text: `Thanks for signing up. We will send you new ideas, real weddings and planning guides now and then.\n\nStart here: ${site()}/blog\n\nTo stop these emails: ${site()}/unsubscribe/${p.token}\n\nOLReady`,
      };
    case 'booking_confirmed':
      return {
        subject: `Your booking with ${p.vendor} is on record`,
        text: `Hi ${p.name},\n\nYour ${p.category || 'wedding'} booking with ${p.vendor} is recorded on OLReady, and their calendar now shows your dates as taken.\n\nIf you were the one who told us, your thank-you perk is in your account: ${site()}/me\n\nIf this is not right, reply to this email.\n\nOLReady`,
      };
    case 'request_received':
      return {
        subject: 'We have your request',
        text: `Hi ${p.name},\n\nThanks for your request for ${p.cats}. Our team will call you to confirm the details, usually within one working day. Vendors see your request only after that call.\n\nYou can add functions, dates and budgets any time: ${site()}/me\n\nOLReady`,
      };
    case 'booking_recorded_vendor':
      return {
        subject: `Booking recorded: ${p.bride}`,
        text: `Hi ${p.business},\n\nYour ${p.category} booking with ${p.bride} (${p.when}) is recorded. The dates are marked booked on your calendar, so check it is right: ${site()}/vendor/calendar\n\nOLReady`,
      };
    case 'vendor_profile_live':
      return {
        subject: 'Your OLReady profile is live',
        text: `Hi ${p.business},\n\nYour profile is approved and live: ${p.link}\n\nThree things bring more enquiries: keep your calendar up to date, add recent work photos, and reply to requests the same day.\n\nVerified requests in your category and towns appear here: ${site()}/vendor\n\nOLReady`,
      };
    case 'vendor_profile_back':
      return {
        subject: 'Your OLReady profile needs a few changes',
        text: `Hi ${p.business},\n\nWe reviewed your profile and it needs changes before it can go live. Open it to see what is missing, then send it for review again: ${site()}/vendor/profile\n\nReply to this email if you want help.\n\nOLReady`,
      };
    case 'vendor_profile_paused':
      return {
        subject: 'Your OLReady profile is paused',
        text: `Hi ${p.business},\n\nYour profile is paused and is not shown to brides for now. Reply to this email and our team will tell you what is needed to bring it back.\n\nOLReady`,
      };
    case 'claim_approved':
      return {
        subject: `${p.business} is now yours on OLReady`,
        text: `Hi,\n\nYour claim on ${p.business} is approved. Sign in to finish the profile and send it for review: ${site()}/vendor/profile\n\nOLReady`,
      };
    case 'claim_rejected':
      return {
        subject: `About your claim on ${p.business}`,
        text: `Hi,\n\nWe could not approve your claim on ${p.business}. If you run this business, reply to this email with a document or link that shows it and we will look again.\n\nOLReady`,
      };
    case 'payment_received':
      return {
        subject: `Payment received: ${p.amount}`,
        text: `Hi ${p.business},\n\nWe received ${p.amount} for ${p.what}.\n\n${p.next}\n\n${p.invoiceNo ? `Tax invoice ${p.invoiceNo}` : 'Receipt'}: ${p.invoice}\n\nOLReady`,
      };
    case 'plan_started':
      return {
        subject: `Your ${p.plan} plan is active`,
        text: `Hi ${p.business},\n\nYour ${p.plan} plan is active with ${p.credits} verified enquiries, valid until ${p.until}.\n\nTo get results from it:\n1. Open new requests the day they arrive. Each one closes after a set number of vendors.\n2. Keep your calendar current, so you are shown as free on the right dates.\n3. Send a clear quote for each function.\n\nOpen requests: ${site()}/vendor\n\nOLReady`,
      };
    case 'credits_low':
      return {
        subject: `${p.left} ${String(p.left) === '1' ? 'enquiry' : 'enquiries'} left`,
        text: `Hi ${p.business},\n\nYou have ${p.left} ${String(p.left) === '1' ? 'enquiry' : 'enquiries'} left. Top up so you do not miss the next request: ${site()}/vendor/packs\n\nOLReady`,
      };
    case 'plan_usage_low':
      return {
        subject: `You have used ${p.used} of ${p.credits} enquiries`,
        text: `Hi ${p.business},\n\nYour ${p.plan} plan has ${p.daysLeft} days left and you have used ${p.used} of ${p.credits} enquiries. Unused enquiries end with the plan.\n\n${Number(p.openLeads) > 0 ? `${p.openLeads} verified ${String(p.openLeads) === '1' ? 'request is' : 'requests are'} open for you right now` : 'New verified requests arrive most days'}: ${site()}/vendor\n\nWhat usually helps:\n1. Check requests daily and open the ones that fit before they close.\n2. Update your calendar, so brides searching by date find you.\n3. Add the towns you travel to, so you see requests from them.\n\nWant us to go through it with you? Reply to this email and your OLReady contact will call.\n\nOLReady`,
      };
    case 'review_received':
      return {
        subject: `New review from ${p.by}`,
        text: `Hi ${p.business},\n\n${p.by} reviewed you: ${p.stars} out of 5. Read it and reply: ${site()}/vendor/reviews\n\nOLReady`,
      };
    case 'dispute_update':
      return {
        subject: 'Update on your review dispute',
        text: `Hi ${p.business},\n\n${
          p.stage === 'contacted'
            ? `We have started on your dispute. Please send your proof by ${p.due}. Without it the review stays as it is.`
            : p.stage === 'upheld'
              ? 'We agreed with your dispute and the review has been removed.'
              : p.stage === 'rejected'
                ? 'We looked at your proof and the review stays published. You can still reply to it publicly.'
                : 'The time to send proof has passed, so the review stays published.'
        }\n\n${site()}/vendor/reviews\n\nOLReady`,
      };
    case 'staff_alert':
      return { subject: `OLReady: ${p.what}`, text: `${p.what}\n${p.detail}\n\n${p.link}` };
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
      and l.event_date between (now() at time zone 'Asia/Kolkata')::date - 14 and (now() at time zone 'Asia/Kolkata')::date - 1
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
