import { type NextRequest } from 'next/server';
import { sql, DomainError } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { ask } from '@/lib/brideAssistant';

export const maxDuration = 120;

/**
 * Ask Olready. Streams newline-delimited JSON: {type:'thread'}, {type:'status'} while tools
 * run, then {type:'done'} with the checked answer, or {type:'error'}.
 */
export async function POST(req: NextRequest) {
  const p = await currentProfile();
  if (!p) return Response.json({ type: 'error', message: 'Sign in to use Ask Olready.' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { threadId?: string; text?: string };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const r = await ask(sql, p, { threadId: body.threadId ?? null, text: String(body.text ?? '') }, send);
        send({ type: 'done', ...r });
      } catch (e) {
        send({ type: 'error', message: e instanceof DomainError ? e.message : 'Something went wrong. Try again.' });
        if (!(e instanceof DomainError)) console.error('assistant', e);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
