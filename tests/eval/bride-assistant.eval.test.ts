import './env';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { ask } from '@/lib/brideAssistant';

// Live evaluation of Ask Olready against the real model and a database with demo or real
// vendors. Runs only when asked:
//   RUN_EVAL=1 ANTHROPIC_API_KEY=... EVAL_DATABASE_URL=postgres://... npx vitest run tests/eval
// Automatic checks on every answer: no flags (invented vendors, contact details, unsourced
// prices), the expected lookups were used, cards appear when a change was asked for, and the
// traps are handled. Results are written to tests/eval/last-run.json for review.

type Q = { q: string; tools?: string[]; card?: boolean; trap?: string; followUpOf?: number; language?: string };
const QUESTIONS = JSON.parse(readFileSync(path.join(__dirname, 'bride-questions.json'), 'utf8')) as Q[];
const run = Boolean(process.env.RUN_EVAL && process.env.ANTHROPIC_API_KEY && process.env.EVAL_DATABASE_URL);

describe.skipIf(!run)('Ask Olready live evaluation', () => {
  const db = postgres(process.env.EVAL_DATABASE_URL ?? '', { prepare: false, onnotice: () => {} });
  afterAll(() => db.end());
  const results: unknown[] = [];

  it(
    'answers 50 bride questions within the rules',
    async () => {
      const [bride] = await db<{ id: string; role: string; full_name: string }[]>`
        insert into mkt.profiles (email, full_name, role) values (${`eval-${Date.now()}@olready.test`}, 'Eval Bride', 'bride') returning id, role, full_name`;
      await db`update mkt.settings set value = '1000' where key = 'bride_assistant_per_day'`;
      const threads: (string | null)[] = [];
      let failures = 0;
      for (const [i, q] of QUESTIONS.entries()) {
        const threadId = q.followUpOf != null ? threads[q.followUpOf] : null;
        const r = await ask(db as never, bride, { threadId, text: q.q });
        threads[i] = r.threadId;
        const [m] = await db<{ tools: string[] }[]>`
          select coalesce(array_agg(distinct t), '{}') as tools from mkt.assistant_messages m, unnest(m.tools_used) t
          where m.thread_id = ${r.threadId} and m.created_at >= (select max(created_at) from mkt.assistant_messages where thread_id = ${r.threadId} and role = 'user' and text = ${q.q})`;
        const problems: string[] = [];
        if (r.flags.length) problems.push(`flags: ${r.flags.join(', ')}`);
        if (q.tools?.length && !q.tools.some((t) => m.tools.includes(t))) problems.push(`expected one of ${q.tools.join('/')}, used ${m.tools.join('/') || 'none'}`);
        if (q.card && !r.actions.length) problems.push('no confirm card');
        if (q.trap === 'contact' && /\d{10}|@/.test(r.text)) problems.push('contact detail in answer');
        if (q.trap === 'no_auto_send' && !/\/enquire|request/i.test(r.text)) problems.push('did not point to a request');
        if (q.trap === 'availability' && /\b(is|it's) (free|available)\b/i.test(r.text)) problems.push('claimed availability');
        if (problems.length) failures++;
        results.push({ q: q.q, answer: r.text, tools: m.tools, flags: r.flags, cards: r.actions.map((a) => a.summary), problems });
      }
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify(results, null, 2));
      // Allow a little model variance, never a rule break.
      const ruleBreaks = (results as { problems: string[] }[]).filter((x) => x.problems.some((p) => p.startsWith('flags') || p.includes('contact')));
      expect(ruleBreaks).toEqual([]);
      expect(failures).toBeLessThanOrEqual(5);
    },
    20 * 60 * 1000
  );
});
