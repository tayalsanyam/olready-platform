import type { Db } from './db';
import { DomainError, audit } from './db';

export const FLAG_LABELS: Record<string, string> = {
  otp: 'Mentions an OTP or PIN',
  card: 'Looks like card or bank details',
  abuse: 'Abusive language',
  off_platform: 'Asks to pay or move outside Olready',
  link: 'Link to an unfamiliar site',
};
export const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam',
  abuse: 'Rude or abusive',
  payment_outside: 'Asked me to pay outside Olready',
  fake: 'Fake or misleading',
  other: 'Something else',
};

// Links to these sites are normal in wedding chats: portfolios, maps, references.
const SAFE_HOSTS = /(^|\.)(instagram\.com|youtube\.com|youtu\.be|pinterest\.[a-z.]+|pin\.it|google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|wa\.me|whatsapp\.com|olready\.in|facebook\.com|drive\.google\.com)$/i;
const ABUSE = /\b(idiot|stupid|bastard|bloody fool|chutiya|chutiye|madarchod|bhenchod|behenchod|kutta|kutti|harami|saala|gandu|bitch|fuck\w*)\b/i;

function luhn(d: string) {
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Flags for a chat message. Phone numbers are allowed: sharing them is the point once a lead is unlocked. */
export function flagsFor(text: string): string[] {
  const t = text.toLowerCase();
  const flags: string[] = [];
  if (/\b(otp|one[\s-]?time[\s-]?password|pin\b|cvv|upi pin)\b/.test(t)) flags.push('otp');
  // A card number (13-19 digits, spaces or dashes allowed, passes the Luhn check), or an IFSC code with an account number.
  const runs = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  if (runs.some((r) => luhn(r.replace(/\D/g, '')))) flags.push('card');
  else if (/\b[a-z]{4}0[a-z0-9]{6}\b/i.test(text) && /\b\d{9,18}\b/.test(text)) flags.push('card');
  if (ABUSE.test(text)) flags.push('abuse');
  if (/(pay|transfer|send|advance|booking amount).{0,40}(directly|outside|personal account|my account|my upi|gpay|phonepe|paytm|cash)|(outside|without) olready/i.test(text)) {
    flags.push('off_platform');
  }
  for (const m of text.matchAll(/\bhttps?:\/\/([^\s/?#]+)/gi)) {
    if (!SAFE_HOSTS.test(m[1])) {
      flags.push('link');
      break;
    }
  }
  return flags;
}

export async function reportMessage(db: Db, messageId: number, reporter: { id: string }, reason: string, note: string, side: string) {
  if (!REPORT_REASONS[reason]) throw new DomainError('bad_reason', 'Pick a reason');
  const [m] = await db<{ sender_profile_id: string }[]>`select sender_profile_id from mkt.messages where id = ${messageId}`;
  if (!m) throw new DomainError('not_found', 'Message not found');
  if (m.sender_profile_id === reporter.id) throw new DomainError('own', 'You cannot report your own message');
  if (side === 'staff') throw new DomainError('forbidden', 'Staff hide messages from the moderation queue');
  await db`
    insert into mkt.message_reports (message_id, reported_by, reason, note) values (${messageId}, ${reporter.id}, ${reason}, ${note.slice(0, 300)})
    on conflict (message_id, reported_by) do nothing`;
  await db`update mkt.messages set review_status = 'flagged' where id = ${messageId} and review_status in ('none','cleared')`;
}

export async function moderate(db: Db, messageId: number, decision: 'hide' | 'clear' | 'show', actor: string) {
  const status = decision === 'hide' ? 'hidden' : 'cleared';
  const [m] = await db`
    update mkt.messages set review_status = ${status}, reviewed_by = ${actor}, reviewed_at = now() where id = ${messageId} returning id`;
  if (!m) throw new DomainError('not_found', 'Message not found');
  await audit(db, actor, `message.${decision}`, 'message', String(messageId));
}

export type QueueItem = {
  id: number;
  thread_id: string;
  body: string;
  attachment_url: string | null;
  flags: string[];
  review_status: string;
  sender_name: string;
  sender_role: string;
  vendor_name: string;
  bride_name: string;
  created_at: Date;
  reports: { reason: string; note: string; by: string }[];
  before: { sender_name: string; body: string; created_at: Date }[];
};

export async function moderationQueue(db: Db, status: 'flagged' | 'hidden' | 'cleared' = 'flagged') {
  return db<QueueItem[]>`
    select m.id, m.thread_id, m.body, m.attachment_url, m.flags, m.review_status, p.full_name as sender_name, p.role as sender_role,
           v.business_name as vendor_name, l.bride_name, m.created_at,
           coalesce((select json_agg(json_build_object('reason', r.reason, 'note', r.note, 'by', rp.full_name) order by r.created_at)
                     from mkt.message_reports r join mkt.profiles rp on rp.id = r.reported_by where r.message_id = m.id), '[]') as reports,
           coalesce((select json_agg(x order by x.created_at) from (
               select bp.full_name as sender_name, b.body, b.created_at from mkt.messages b join mkt.profiles bp on bp.id = b.sender_profile_id
               where b.thread_id = m.thread_id and b.id < m.id order by b.id desc limit 3) x), '[]') as before
    from mkt.messages m
    join mkt.profiles p on p.id = m.sender_profile_id
    join mkt.threads t on t.id = m.thread_id
    join mkt.vendors v on v.id = t.vendor_id
    join mkt.lead_needs ln on ln.id = t.lead_need_id
    join mkt.leads l on l.id = ln.lead_id
    where m.review_status = ${status}
    order by m.created_at desc limit 100`;
}
