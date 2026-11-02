import type { Db } from './db';

export type EmailTemplate = 'post_event_feedback' | 'lead_verified' | 'claim_invite' | 'booking_confirmed';

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
    const { subject, text } = render(m.template, m.payload);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'OLReady <care@olready.in>', to: m.to_email, subject, text }),
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
