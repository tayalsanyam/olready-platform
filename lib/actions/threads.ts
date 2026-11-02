'use server';

import { sql } from '../db';
import { requireProfile } from '../auth';
import { decideQuote, postMessage, sendQuote } from '../threads';
import { notifyMessage, notifyQuote } from '../notify';
import { attempt, back, num, str } from './run';

export async function postMessageAction(fd: FormData) {
  const threadId = str(fd, 'thread_id');
  await attempt(back(fd, '/'), async () => {
    const p = await requireProfile();
    await postMessage(sql, threadId, p, str(fd, 'body'));
    await notifyMessage(sql, threadId, p.id, str(fd, 'body'));
  });
}

export async function sendQuoteAction(fd: FormData) {
  await attempt(back(fd, '/vendor/threads'), async () => {
    const p = await requireProfile();
    const q = await sendQuote(sql, str(fd, 'thread_id'), p, num(fd, 'amount_inr') ?? 0, str(fd, 'details'));
    await notifyQuote(sql, q.id, 'sent');
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
