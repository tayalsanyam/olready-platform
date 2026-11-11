import type { Db } from './db';
import { DomainError, getSetting } from './db';
import { askClaude, jsonFrom } from './ai';

// The Ops assistant turns a question into one SELECT over the ops_reports views, runs it
// read-only as the ops_assistant role (which can read those views and nothing else), and
// explains the result. The views hold no phone numbers, emails or brides' names.

export const MAX_ROWS = 500;

const FUNCS = new Set(
  `count sum avg min max round coalesce nullif greatest least date_trunc date_part extract now current_date to_char to_date
   lower upper length trim string_agg array_agg percentile_cont percentile_disc mode stddev variance abs ceil floor
   row_number rank dense_rank lag lead first_value last_value ntile cast bool_or bool_and every generate_series age
   make_date make_interval interval split_part left right replace substring position concat cardinality unnest array_length`.split(/\s+/)
);
// Words that can be followed by "(" without being a function call.
const KEYWORDS = new Set(
  `select from where and or not in exists any all as on join using over filter within group by order partition values case when then
   else end is null between like ilike having union intersect except distinct limit offset with recursive asc desc nulls first last
   lateral inner left right full outer cross natural rows range preceding following current row unbounded true false date timestamp
   timestamptz numeric int integer bigint text boolean varchar char`.split(/\s+/)
);
const BANNED_WORDS = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|vacuum|analyze|reindex|cluster|listen|notify|prepare|execute|deallocate|discard|lock|call|do|set|reset|show|begin|commit|rollback|savepoint|into|security|owner)\b/i;
const BANNED_SCHEMAS = /\b(mkt|public|auth|storage|extensions|vault|realtime|graphql|graphql_public|supabase_\w+|pg_\w+|information_schema|cron|net)\s*\./i;

/** Rejects anything that is not one plain SELECT over the reporting views. Returns the cleaned SQL. */
export function checkSql(raw: string) {
  let s = raw.trim().replace(/;\s*$/, '');
  if (!s) throw new DomainError('empty', 'There is no query to run');
  if (s.length > 6000) throw new DomainError('long', 'That query is too long');
  if (/--|\/\*|\*\/|"|\$|\\|;/.test(s)) throw new DomainError('chars', 'Queries cannot use comments, double quotes, dollar quotes, backslashes or more than one statement');
  if (!/^(select|with)\b/i.test(s)) throw new DomainError('select', 'Only SELECT queries can run');
  // Look at the query with string literals blanked out, so words inside quotes do not count.
  const bare = s.replace(/'(?:[^']|'')*'/g, "''");
  if (/'/.test(bare.replace(/''/g, ''))) throw new DomainError('quote', 'A quote in the query is not closed');
  const banned = bare.match(BANNED_WORDS);
  if (banned) throw new DomainError('banned', `Queries cannot use "${banned[1].toLowerCase()}"`);
  const schema = bare.match(BANNED_SCHEMAS);
  if (schema) throw new DomainError('schema', `Queries can only read the reporting views, not ${schema[1].toLowerCase()}`);
  for (const m of bare.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const w = m[1].toLowerCase();
    if (!FUNCS.has(w) && !KEYWORDS.has(w)) throw new DomainError('func', `Queries cannot call ${w}()`);
  }
  s = s.replace(/\s+$/, '');
  return s;
}

/** The views and their columns, read live so the description never drifts from the database. */
export async function reportingSchema(db: Db) {
  const rows = await db<{ table_name: string; column_name: string; data_type: string }[]>`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'ops_reports' order by table_name, ordinal_position`;
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.table_name, [...(by.get(r.table_name) ?? []), `${r.column_name} ${r.data_type.replace('timestamp with time zone', 'timestamptz')}`]);
  return [...by].map(([t, cols]) => `ops_reports.${t}(${cols.join(', ')})`).join('\n');
}

export type RunResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean };

/** Runs a checked query read-only, as ops_assistant, with an 8 second limit. */
export async function runReportQuery(db: Db, query: string): Promise<RunResult> {
  const q = checkSql(query);
  try {
    return await db.begin('read only', async (tx) => {
      await tx`set local role ops_assistant`;
      await tx`set local statement_timeout = '8s'`;
      await tx`set local search_path = ops_reports`;
      const rows = (await tx.unsafe(`select * from (${q}) as _q limit ${MAX_ROWS + 1}`)) as unknown as Record<string, unknown>[];
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return { columns, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
    });
  } catch (e) {
    if (e instanceof DomainError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/statement timeout/i.test(msg)) throw new DomainError('timeout', 'The query took longer than 8 seconds. Narrow it down.');
    throw new DomainError('sql', `The query failed: ${msg}`);
  }
}

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export async function assistantAllowance(db: Db, profileId: string) {
  const [perPerson, team] = await Promise.all([getSetting<number>(db, 'ops_assistant_per_person_day', 150), getSetting<number>(db, 'ops_assistant_team_day', 1000)]);
  const [u] = await db<{ mine: number; all: number }[]>`
    select count(*) filter (where profile_id = ${profileId})::int as mine, count(*)::int as all
    from mkt.ops_assistant_log where created_at >= (${today()}::date)::timestamp at time zone 'Asia/Kolkata' and kind = 'ask'`;
  return { perPerson, team, mine: u.mine, all: u.all, left: Math.max(0, Math.min(perPerson - u.mine, team - u.all)) };
}

const model = () => process.env.ANTHROPIC_OPS_MODEL ?? 'claude-sonnet-5-5';
const OFF = 'The assistant is not switched on yet. Add ANTHROPIC_API_KEY to turn it on, or use the Data lists.';

function jsonSafe(rows: Record<string, unknown>[]) {
  return JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))) as Record<string, unknown>[];
}

/** Question in, SQL plus a plain answer out. Everything is logged, including failures. */
export async function ask(db: Db, profileId: string, question: string) {
  const qn = question.trim().slice(0, 1000);
  if (qn.length < 4) throw new DomainError('short', 'Ask a question');
  const allowance = await assistantAllowance(db, profileId);
  if (allowance.left <= 0) throw new DomainError('limit', 'The daily limit for questions is used up. The Data lists still work.');
  const schema = await reportingSchema(db);
  const now = today();
  const log = async (fields: { sql?: string | null; answer?: string | null; error?: string | null; result?: RunResult | null }) => {
    const [row] = await db<{ id: string }[]>`
      insert into mkt.ops_assistant_log (profile_id, kind, question, sql, answer, row_count, error, columns, rows)
      values (${profileId}, 'ask', ${qn}, ${fields.sql ?? null}, ${fields.answer ?? null}, ${fields.result?.rows.length ?? null}, ${fields.error ?? null},
        ${fields.result?.columns ?? null}, ${fields.result ? db.json(jsonSafe(fields.result.rows) as never) : null})
      returning id`;
    return row.id;
  };

  const system = `You write PostgreSQL for Olready, a wedding vendor marketplace for towns across India (launched first in Chandigarh, Mohali and Panchkula). Every vendor and request belongs to a town, which belongs to a state; ops_reports.vendor_areas has each vendor's town, area and pincode.
Brides send one request (a lead) that is split into lead_needs, one per vendor category. Verified needs are shown to vendors, who spend credits to unlock them (unlocks), then chat (threads) and send quotes. bookings are booking reports. Money is in rupees (_inr columns). Today is ${now} (India time).
You may read only these views:
${schema}
Rules: write ONE SELECT (or WITH ... SELECT) statement. Qualify views as ops_reports.name. No comments, no double quotes, no semicolons, no functions other than ordinary aggregates, date and text functions. Prefer readable aliases in snake_case. Add ORDER BY and LIMIT 200 unless the answer is a single row.
Reply with JSON only: {"sql":"...","note":"one short sentence on what the query counts"}. If the question cannot be answered from these views, reply {"sql":null,"note":"why not"}.`;
  let text: string;
  try {
    text = await askClaude({ model: model(), system, messages: [{ role: 'user', content: qn }], maxTokens: 1200, offMessage: OFF });
  } catch (e) {
    await log({ error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  const plan = jsonFrom<{ sql: string | null; note?: string }>(text);
  if (!plan?.sql) {
    const why = plan?.note ?? 'The assistant could not write a query for that.';
    const id = await log({ answer: why });
    return { id };
  }
  let result: RunResult;
  try {
    result = await runReportQuery(db, plan.sql);
  } catch (e) {
    const id = await log({ sql: plan.sql, error: e instanceof Error ? e.message : String(e) });
    return { id };
  }
  let answer = plan.note ?? '';
  try {
    const sample = JSON.stringify(jsonSafe(result.rows.slice(0, 60)));
    answer = await askClaude({
      model: model(),
      system: 'You explain query results to an operations team in plain English. Two to four sentences. Lead with the answer and the key numbers. Do not invent numbers that are not in the rows. Mention it if the rows look incomplete.',
      messages: [{ role: 'user', content: `Question: ${qn}\nQuery: ${plan.sql}\nRows (${result.rows.length}${result.truncated ? '+, cut at ' + MAX_ROWS : ''} total, first 60 shown): ${sample}` }],
      maxTokens: 400,
      offMessage: OFF,
    });
  } catch {
    // The table still answers the question; keep the note.
  }
  const id = await log({ sql: plan.sql, answer: answer.trim(), result });
  return { id };
}

/** Runs an edited query without the AI, logged but not counted against the question limit. */
export async function rerun(db: Db, profileId: string, question: string, query: string) {
  let result: RunResult | null = null;
  let error: string | null = null;
  try {
    result = await runReportQuery(db, query);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const [row] = await db<{ id: string }[]>`
    insert into mkt.ops_assistant_log (profile_id, kind, question, sql, row_count, error, columns, rows)
    values (${profileId}, 'rerun', ${question.slice(0, 1000) || 'Edited query'}, ${query.slice(0, 6000)}, ${result?.rows.length ?? null}, ${error},
      ${result?.columns ?? null}, ${result ? db.json(jsonSafe(result.rows) as never) : null})
    returning id`;
  return { id: row.id };
}

export type LogEntry = {
  id: string;
  profile_id: string;
  kind: 'ask' | 'rerun';
  question: string;
  sql: string | null;
  answer: string | null;
  row_count: number | null;
  error: string | null;
  columns: string[] | null;
  rows: Record<string, unknown>[] | null;
  created_at: Date;
};

export async function logEntry(db: Db, id: string, viewer: { id: string; role: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [e] = await db<LogEntry[]>`select * from mkt.ops_assistant_log where id = ${id}`;
  if (!e || (e.profile_id !== viewer.id && viewer.role !== 'admin')) return null;
  return e;
}

export async function recentQuestions(db: Db, profileId: string, limit = 12) {
  return db<{ id: string; question: string; created_at: Date; error: string | null }[]>`
    select id, question, created_at, error from mkt.ops_assistant_log where profile_id = ${profileId} and kind = 'ask'
    order by created_at desc limit ${limit}`;
}
