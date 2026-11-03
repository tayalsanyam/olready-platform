'use server';

import { sql } from '../db';
import { requireRole } from '../auth';
import { ask, rerun } from '../opsAssistant';
import { attempt, str } from './run';

export async function askAssistantAction(fd: FormData) {
  await attempt('/ops/assistant', async () => {
    const me = await requireRole(['ops', 'admin'], '/ops/assistant');
    const { id } = await ask(sql, me.id, str(fd, 'question'));
    return `/ops/assistant?id=${id}`;
  });
}

export async function rerunAssistantAction(fd: FormData) {
  await attempt('/ops/assistant', async () => {
    const me = await requireRole(['ops', 'admin'], '/ops/assistant');
    const { id } = await rerun(sql, me.id, str(fd, 'question'), str(fd, 'sql'));
    return `/ops/assistant?id=${id}`;
  });
}
