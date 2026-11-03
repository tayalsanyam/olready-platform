'use server';

import { after } from 'next/server';
import { sql } from '../db';
import { readQuote } from '../quoteReader';
import { requireProfile } from '../auth';
import { DomainError } from '../db';
import { decideQuote, postMessage, sendQuote, threadAccess } from '../threads';
import { storeAttachment } from '../storage';
import { moderate, reportMessage } from '../moderation';
import { requireRole } from '../auth';
import { notifyMessage, notifyQuote } from '../notify';
import { attempt, back, num, str } from './run';

export async function postMessageAction(fd: FormData) {
  const threadId = str(fd, 'thread_id');
  await attempt(back(fd, '/'), async () => {
    const p = await requireProfile();
    const f = fd.get('attachment');
    const file = f instanceof File && f.size > 0 ? await storeAttachment(f) : null;
    await postMessage(sql, threadId, p, str(fd, 'body'), file);
    await notifyMessage(sql, threadId, p.id, str(fd, 'body') || (file ? `Sent a file: ${file.name}` : ''));
  });
}

export async function sendQuoteAction(fd: FormData) {
  await attempt(back(fd, '/vendor/threads'), async () => {
    const p = await requireProfile();
    const q = await sendQuote(sql, str(fd, 'thread_id'), p, num(fd, 'amount_inr') ?? 0, str(fd, 'details'));
    await notifyQuote(sql, q.id, 'sent');
    // Read the quote into Included / Extra / Worth asking once it is out; never holds up the send.
    after(() => readQuote(sql, q.id).then(() => undefined, () => undefined));
    return { ok: 'Quote sent' };
  });
}

export async function decideQuoteAction(fd: FormData) {
  await attempt(back(fd, '/me'), async () => {
    const p = await requireProfile();
    const accept = str(fd, 'accept') === '1';
    await decideQuote(sql, str(fd, 'quote_id'), p, accept);
    if (accept) await notifyQuote(sql, str(fd, 'quote_id'), 'accepted');
    return { ok: accept ? 'Quote accepted. When you book, tell us below to get your reward.' : 'Quote declined' };
  });
}

export async function reportMessageAction(fd: FormData) {
  await attempt(back(fd, '/'), async () => {
    const p = await requireProfile();
    const id = Number(str(fd, 'message_id'));
    if (!Number.isInteger(id)) throw new DomainError('not_found', 'Message not found');
    const [m] = await sql<{ thread_id: string }[]>`select thread_id from mkt.messages where id = ${id}`;
    if (!m) throw new DomainError('not_found', 'Message not found');
    const access = await threadAccess(sql, m.thread_id, p);
    await reportMessage(sql, id, p, str(fd, 'reason'), str(fd, 'note'), access.side);
    return { ok: 'Thanks. Our team will look at this message.' };
  });
}

export async function opsModerateAction(fd: FormData) {
  await attempt(back(fd, '/ops/moderation'), async () => {
    const p = await requireRole(['ops', 'admin']);
    const d = str(fd, 'decision');
    if (!['hide', 'clear', 'show'].includes(d)) throw new DomainError('bad', 'Unknown decision');
    await moderate(sql, Number(str(fd, 'message_id')), d as 'hide' | 'clear' | 'show', p.id);
    return { ok: d === 'hide' ? 'Message hidden for both sides' : d === 'show' ? 'Message shown again' : 'Marked as fine' };
  });
}
