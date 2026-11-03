import { DomainError } from './db';

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

type Content = string | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[];

/** One Claude Messages call; returns the text. Errors become friendly DomainErrors. */
export async function askClaude(o: { model: string; system?: string; messages: { role: 'user' | 'assistant'; content: Content }[]; maxTokens?: number; timeoutMs?: number; offMessage: string }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new DomainError('off', o.offMessage);
  let res: Response;
  try {
    res = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(o.timeoutMs ?? 30000),
      body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens ?? 1000, system: o.system, messages: o.messages }),
    });
  } catch {
    throw new DomainError('ai_error', 'The AI did not answer in time. Try again.');
  }
  if (!res.ok) throw new DomainError('ai_error', `The AI could not answer (${res.status}). Try again.`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
}

/** The first JSON object in a model reply, or null. */
export function jsonFrom<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
