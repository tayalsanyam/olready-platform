'use server';

import { sql } from '../db';
import { requireRole } from '../auth';
import { saveTemplate, sendTest } from '../whatsapp';
import { attempt, str } from './run';

export async function saveWhatsAppTemplate(fd: FormData) {
  await attempt('/ops/whatsapp', async () => {
    const me = await requireRole(['admin'], '/ops/whatsapp');
    await saveTemplate(sql, str(fd, 'event'), { templateName: str(fd, 'template_name'), language: str(fd, 'language'), enabled: fd.get('enabled') === 'on' }, me.id);
    return { ok: 'Saved' };
  });
}

export async function sendWhatsAppTest(fd: FormData) {
  await attempt('/ops/whatsapp', async () => {
    const me = await requireRole(['ops', 'admin'], '/ops/whatsapp');
    await sendTest(sql, str(fd, 'phone'), str(fd, 'event'), me.id);
    return { ok: 'Test sent. Check the phone.' };
  });
}
