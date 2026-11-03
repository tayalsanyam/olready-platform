import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';
import { DomainError, audit } from './db';

// WhatsApp template messages through Meta's Cloud API or Wati. Nothing is sent until a
// provider is configured AND Ops has mapped an approved template to the event AND switched it
// on. Brides get messages only for requests where they ticked the opt-in themselves; vendors
// only when they turned alerts on. A STOP reply opts the number out everywhere.

export type WaEvent = 'request_verified' | 'quote_received' | 'bride_message' | 'vendor_new_lead' | 'vendor_message' | 'quote_accepted';

/** What each event says and the order of its template variables, for Ops setting up templates. */
export const WA_EVENTS: Record<WaEvent, { who: 'bride' | 'vendor'; label: string; params: string[]; sample: string }> = {
  request_verified: {
    who: 'bride',
    label: 'Request verified',
    params: ['first name', 'categories'],
    sample: 'Hi {{1}}, your OLReady request for {{2}} is verified. Vendors can now send you quotes; replies arrive in your OLReady inbox.',
  },
  quote_received: {
    who: 'bride',
    label: 'New quote',
    params: ['first name', 'vendor', 'amount', 'link'],
    sample: 'Hi {{1}}, {{2}} sent you a quote of {{3}}. Compare it with your other quotes: {{4}}',
  },
  bride_message: {
    who: 'bride',
    label: 'New message for a bride',
    params: ['first name', 'vendor', 'link'],
    sample: 'Hi {{1}}, {{2}} replied to you on OLReady: {{3}}',
  },
  vendor_new_lead: {
    who: 'vendor',
    label: 'New verified lead',
    params: ['business', 'category', 'city', 'date', 'link'],
    sample: 'New verified {{2}} lead in {{3}} for {{4}}, {{1}}. Unlock it before it fills up: {{5}}',
  },
  vendor_message: {
    who: 'vendor',
    label: 'New message for a vendor',
    params: ['business', 'bride first name', 'link'],
    sample: '{{2}} replied to {{1}} on OLReady: {{3}}',
  },
  quote_accepted: {
    who: 'vendor',
    label: 'Quote accepted',
    params: ['business', 'bride first name', 'amount', 'link'],
    sample: 'Good news, {{1}}: {{2}} accepted your quote of {{3}}. Talk next steps: {{4}}',
  },
};

export type Provider = 'meta' | 'wati';

export function waProvider(): Provider | null {
  const p = process.env.WHATSAPP_PROVIDER;
  if (p === 'meta' && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) return 'meta';
  if (p === 'wati' && process.env.WHATSAPP_TOKEN && process.env.WATI_API_URL) return 'wati';
  return null;
}

/** Indian mobile numbers to 91XXXXXXXXXX; anything else is not messageable. */
export function waPhone(raw: string | null | undefined) {
  const d = (raw ?? '').replace(/\D/g, '');
  const n = d.length === 10 ? `91${d}` : d.length === 12 && d.startsWith('91') ? d : d.length === 11 && d.startsWith('0') ? `91${d.slice(1)}` : null;
  return n && /^91[6-9]\d{9}$/.test(n) ? n : null;
}

/**
 * Queues one message if everything allows it. The caller has already checked the person's
 * consent; this checks the channel, the template and STOP replies. Returns whether it queued.
 */
export async function queueWhatsApp(db: Db, phone: string | null, event: WaEvent, params: string[], dedupeKey: string) {
  if (!waProvider()) return false;
  const to = waPhone(phone);
  if (!to) return false;
  const [t] = await db<{ enabled: boolean; template_name: string }[]>`select enabled, template_name from mkt.whatsapp_templates where event = ${event}`;
  if (!t?.enabled || !t.template_name) return false;
  const [out] = await db`select 1 from mkt.whatsapp_optouts where phone = ${to}`;
  if (out) return false;
  const clean = params.map((p) => String(p ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || '-');
  const r = await db`
    insert into mkt.whatsapp_outbox (to_phone, event, params, dedupe_key) values (${to}, ${event}, ${clean}, ${dedupeKey})
    on conflict (dedupe_key) do nothing returning id`;
  return r.length > 0;
}

async function sendOne(provider: Provider, to: string, template: string, language: string, params: string[]) {
  if (provider === 'meta') {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template, language: { code: language }, components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : [] },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !body.messages?.[0]?.id) throw new Error(body.error?.message ?? `Meta answered ${res.status}`);
    return body.messages[0].id;
  }
  const base = (process.env.WATI_API_URL ?? '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/sendTemplateMessage?whatsappNumber=${to}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ template_name: template, broadcast_name: `olready_${template}`, parameters: params.map((value, i) => ({ name: String(i + 1), value })) }),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: boolean; info?: string; id?: string; localMessageId?: string };
  if (!res.ok || body.result === false) throw new Error(body.info ?? `Wati answered ${res.status}`);
  return body.localMessageId ?? body.id ?? 'wati';
}

/** Sends queued messages, oldest first. Three tries each, then it stays failed for Ops to see. */
export async function flushWhatsApp(db: Db, limit = 30) {
  const provider = waProvider();
  if (!provider) return { sent: 0, failed: 0 };
  const rows = await db<{ id: string; to_phone: string; params: string[]; template_name: string; language: string; enabled: boolean }[]>`
    update mkt.whatsapp_outbox o set attempts = attempts + 1, updated_at = now()
    from mkt.whatsapp_templates t
    where t.event = o.event and o.id in (
      select id from mkt.whatsapp_outbox where status = 'queued' and attempts < 3 order by created_at limit ${limit} for update skip locked)
    returning o.id, o.to_phone, o.params, t.template_name, t.language, t.enabled`;
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.enabled || !r.template_name) {
      await db`update mkt.whatsapp_outbox set status = 'failed', error = 'Template switched off before sending' where id = ${r.id}`;
      failed++;
      continue;
    }
    try {
      const id = await sendOne(provider, r.to_phone, r.template_name, r.language, r.params);
      await db`update mkt.whatsapp_outbox set status = 'sent', provider_message_id = ${id}, sent_at = now(), error = null where id = ${r.id}`;
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db`update mkt.whatsapp_outbox set error = ${msg.slice(0, 500)}, status = case when attempts >= 3 then 'failed' else 'queued' end where id = ${r.id}`;
      failed++;
    }
  }
  return { sent, failed };
}

/** Records a STOP: the number gets nothing more, and its requests and vendor alerts switch off. */
export async function optOut(db: Db, phone: string) {
  const to = waPhone(phone);
  if (!to) return;
  const local = to.slice(2);
  await db`insert into mkt.whatsapp_optouts (phone) values (${to}) on conflict do nothing`;
  await db`update mkt.leads set whatsapp_opt_in = false where whatsapp_opt_in and right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${local}`;
  await db`update mkt.vendors set whatsapp_alerts = false where whatsapp_alerts and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${local}`;
  await db`update mkt.whatsapp_outbox set status = 'failed', error = 'Opted out' where to_phone = ${to} and status = 'queued'`;
}

const STOP = /^\s*(stop|unsubscribe|cancel|end|quit|band karo|bandh)\s*[.!]?\s*$/i;

type MetaWebhook = {
  entry?: { changes?: { value?: { messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string } }[]; statuses?: { id: string; status: string; errors?: { title?: string }[] }[] } }[] }[];
};

/** Meta webhook body: STOP replies and delivery receipts. */
export async function handleMetaWebhook(db: Db, body: MetaWebhook) {
  for (const e of body.entry ?? [])
    for (const c of e.changes ?? []) {
      for (const m of c.value?.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? '';
        if (STOP.test(text)) await optOut(db, m.from);
      }
      for (const s of c.value?.statuses ?? []) {
        const status = ['sent', 'delivered', 'read', 'failed'].includes(s.status) ? s.status : null;
        if (!status) continue;
        await db`
          update mkt.whatsapp_outbox set status = ${status}, error = coalesce(${s.errors?.[0]?.title ?? null}, error), updated_at = now()
          where provider_message_id = ${s.id}
            and not (status = 'read' and ${status} in ('sent', 'delivered')) and not (status = 'delivered' and ${status} = 'sent')`;
      }
    }
}

/** Wati webhook body: a reply from a number. */
export async function handleWatiWebhook(db: Db, body: { waId?: string; text?: string; eventType?: string }) {
  if (body.waId && body.text && STOP.test(body.text)) await optOut(db, body.waId);
}

export function verifyMetaSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function saveTemplate(db: Db, event: string, input: { templateName: string; language: string; enabled: boolean }, actor: string) {
  if (!(event in WA_EVENTS)) throw new DomainError('event', 'Unknown message');
  const name = input.templateName.trim();
  if (name && !/^[a-z0-9_]{1,512}$/.test(name)) throw new DomainError('name', 'Template names use lowercase letters, numbers and underscores, as in WhatsApp Manager');
  if (input.enabled && !name) throw new DomainError('name', 'Add the approved template name before switching it on');
  const lang = input.language.trim() || 'en';
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(lang)) throw new DomainError('lang', 'Language codes look like en, en_US or hi');
  await db`
    update mkt.whatsapp_templates set template_name = ${name}, language = ${lang}, enabled = ${input.enabled}, updated_at = now(), updated_by = ${actor}
    where event = ${event}`;
  await audit(db, actor, 'whatsapp.template', 'whatsapp_template', event, { name, enabled: input.enabled });
}

/** Sends one template straight away to a staff number, to check the setup end to end. */
export async function sendTest(db: Db, phone: string, event: string, actor: string) {
  const provider = waProvider();
  if (!provider) throw new DomainError('off', 'Set WHATSAPP_PROVIDER and its keys first');
  const def = WA_EVENTS[event as WaEvent];
  if (!def) throw new DomainError('event', 'Unknown message');
  const to = waPhone(phone);
  if (!to) throw new DomainError('phone', 'Enter an Indian mobile number');
  const [t] = await db<{ template_name: string; language: string }[]>`select template_name, language from mkt.whatsapp_templates where event = ${event}`;
  if (!t?.template_name) throw new DomainError('name', 'Add the template name first');
  const sample: Record<string, string> = { 'first name': 'Simran', vendor: 'Glow by Kirti', amount: '₹45,000', link: 'https://olready.in', business: 'Glow by Kirti', 'bride first name': 'Simran', category: 'bridal makeup', city: 'Mohali', date: '14 Feb 2027', categories: 'makeup, photography' };
  try {
    const id = await sendOne(provider, to, t.template_name, t.language, def.params.map((p) => sample[p] ?? 'Test'));
    await audit(db, actor, 'whatsapp.test', 'whatsapp_template', event, { to: `…${to.slice(-4)}` });
    return id;
  } catch (e) {
    throw new DomainError('send', `WhatsApp refused it: ${e instanceof Error ? e.message : String(e)}`);
  }
}
