'use server';

import { redirect } from 'next/navigation';
import { sql, DomainError } from '../db';
import { requireProfile } from '../auth';
import { decideAction, deleteThread, rateMessage } from '../brideAssistant';

type Result = { ok: true; status?: string } | { ok: false; error: string };

export async function decideAssistantAction(actionId: string, confirm: boolean): Promise<Result> {
  const p = await requireProfile('/me/assistant');
  try {
    return { ok: true, status: await decideAction(sql, actionId, p, confirm) };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function rateAssistantMessage(messageId: string, helpful: boolean): Promise<Result> {
  const p = await requireProfile('/me/assistant');
  try {
    await rateMessage(sql, messageId, p.id, helpful);
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteAssistantThread(fd: FormData) {
  const p = await requireProfile('/me/assistant');
  await deleteThread(sql, String(fd.get('thread_id') ?? ''), p.id);
  redirect('/me/assistant');
}
