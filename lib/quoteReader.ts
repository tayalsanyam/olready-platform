import type { Db } from './db';
import { getSetting } from './db';
import { aiEnabled, askClaude, jsonFrom } from './ai';

// Reads a vendor's quote once, into what is included, what is charged extra and what a bride
// should ask before deciding. Only the category, the amount and the vendor's own words go to
// the model; nothing about the bride.

export type QuoteReading = { included: string[]; extra: string[]; ask: string[] };

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const clean = (xs: unknown) =>
  (Array.isArray(xs) ? xs : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter((x) => x.length > 1)
    .map((x) => (x.length > 140 ? `${x.slice(0, 137)}…` : x))
    .slice(0, 6);

/** Returns the reading, or null when the reader is off, the cap is reached or the quote is too short to read. */
export async function readQuote(db: Db, quoteId: string): Promise<QuoteReading | null> {
  if (!aiEnabled()) return null;
  const [q] = await db<{ details: string; amount_inr: number; category: string; done: boolean }[]>`
    select q.details, q.amount_inr, c.name as category,
           exists (select 1 from mkt.quote_readings r where r.quote_id = q.id) as done
    from mkt.quotes q join mkt.threads t on t.id = q.thread_id join mkt.lead_needs ln on ln.id = t.lead_need_id
    join mkt.categories c on c.id = ln.category_id where q.id = ${quoteId}`;
  if (!q || q.done || q.details.trim().length < 20) return null;
  const cap = await getSetting<number>(db, 'quote_reader_site_day', 4000);
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.quote_readings where created_at >= (${today()}::date)::timestamp at time zone 'Asia/Kolkata'`;
  if (n >= cap) return null;
  const text = await askClaude({
    model: process.env.ANTHROPIC_QUOTE_MODEL ?? 'claude-haiku-5-5',
    system: `You help a bride in India compare wedding vendor quotes. Read one quote and sort it into three short lists.
"included": what the vendor says the price covers, in plain words.
"extra": anything the vendor says costs more, is optional, or is charged separately, with the amount if given.
"ask": two to four questions worth asking before booking, about things this kind of vendor usually covers that the quote does not mention (for example travel, taxes, hours, number of edited photos, trial sessions, advance and cancellation).
Each item is under 15 words. Use only what the quote says for "included" and "extra"; never invent prices. Reply with JSON only: {"included":[],"extra":[],"ask":[]}.`,
    messages: [{ role: 'user', content: `Category: ${q.category}\nQuoted price: ₹${q.amount_inr.toLocaleString('en-IN')}\nThe vendor wrote:\n${q.details.slice(0, 4000)}` }],
    maxTokens: 600,
    timeoutMs: 25000,
    offMessage: 'Quote reading is off',
  });
  const r = jsonFrom<Partial<QuoteReading>>(text);
  if (!r) return null;
  const reading = { included: clean(r.included), extra: clean(r.extra), ask: clean(r.ask) };
  if (!reading.included.length && !reading.extra.length && !reading.ask.length) return null;
  await db`
    insert into mkt.quote_readings (quote_id, included, extra, ask) values (${quoteId}, ${reading.included}, ${reading.extra}, ${reading.ask})
    on conflict (quote_id) do nothing`;
  return reading;
}

export async function readingsFor(db: Db, quoteIds: string[]) {
  if (!quoteIds.length) return new Map<string, QuoteReading>();
  const rows = await db<(QuoteReading & { quote_id: string })[]>`
    select quote_id, included, extra, ask from mkt.quote_readings where quote_id = any(${quoteIds}::uuid[])`;
  return new Map(rows.map((r) => [r.quote_id, { included: r.included, extra: r.extra, ask: r.ask }]));
}
