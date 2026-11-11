import type { Db } from './db';
import { DomainError, audit } from './db';
import { queueEmail } from './email';
import { OPERATOR } from './legal';

export const CONTACT_TOPICS: Record<string, string> = {
  bride: 'Planning my wedding',
  vendor: 'My business on Olready',
  payment: 'A payment, invoice or refund',
  privacy: 'My data and privacy',
  grievance: 'A formal complaint (grievance)',
  press: 'Press or partnership',
  other: 'Something else',
};

/** A message from the contact page. Rate-limited per visitor; Ops gets an email and a queue item. */
export async function sendContact(
  db: Db,
  input: { name: string; email: string; phone: string; topic: string; message: string; visitor: string | null; profileId: string | null }
) {
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase().slice(0, 120);
  const phone = input.phone.replace(/[^\d+]/g, '').slice(0, 15);
  const message = input.message.trim().slice(0, 3000);
  if (!name) throw new DomainError('name', 'Tell us your name');
  if (!email && !phone) throw new DomainError('reach', 'Give an email or a phone number so we can reply');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError('email', 'Check your email address');
  if (!CONTACT_TOPICS[input.topic]) throw new DomainError('topic', 'Pick what this is about');
  if (message.length < 10) throw new DomainError('message', 'Write a little more so we can help');
  if (input.visitor) {
    const [{ n }] = await db<{ n: number }[]>`
      select count(*)::int as n from mkt.contact_messages where visitor = ${input.visitor} and created_at > now() - interval '1 day'`;
    if (n >= 5) throw new DomainError('limit', `We have your messages from today. For anything urgent, call ${OPERATOR.phone}.`);
  }
  const [m] = await db<{ id: string }[]>`
    insert into mkt.contact_messages (name, email, phone, topic, message, visitor, profile_id)
    values (${name}, ${email || null}, ${phone || null}, ${input.topic}, ${message}, ${input.visitor}, ${input.profileId}) returning id`;
  await queueEmail(db, OPERATOR.email, 'contact_received', { name, email, phone, topic: CONTACT_TOPICS[input.topic], message }, `contact:${m.id}`);
  return m.id;
}

export async function openContacts(db: Db) {
  return db<{ id: string; name: string; email: string | null; phone: string | null; topic: string; message: string; created_at: Date }[]>`
    select id, name, email, phone, topic, message, created_at from mkt.contact_messages where status = 'open' order by created_at limit 50`;
}

export async function closeContact(db: Db, id: string, note: string, actor: string) {
  await db`update mkt.contact_messages set status = 'done', reply_note = ${note.trim().slice(0, 500)}, handled_by = ${actor}, handled_at = now() where id = ${id}`;
  await audit(db, actor, 'contact.done', 'contact_message', id);
}
