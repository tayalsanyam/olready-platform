import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { checkSql, runReportQuery, ask, assistantAllowance } from '@/lib/opsAssistant';
import { DATASETS, csvCell, dataset, runDataset } from '@/lib/opsData';
import { readQuote, readingsFor } from '@/lib/quoteReader';
import { advanceVerification, createEnquiry, unlockNeed } from '@/lib/leads';
import { sendQuote, threadQuotes } from '@/lib/threads';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  const o = await profile(sql, 'vendor', 'Seed Studio');
  await liveVendor(sql, o.id, 'photographers', 'chandigarh', 'Seed Studio');
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

const claudeSays = (...texts: string[]) => {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const t of texts) spy.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: 'text', text: t }] }), { status: 200 }));
  return spy;
};

describe('ops data lists', () => {
  it('every list runs with every filter, and search cannot inject', async () => {
    for (const d of DATASETS) {
      const r = await runDataset(sql, d, { q: "x' or 1=1 --", status: d.statuses?.[0], city: 'chandigarh', category: 'photographers', from: '2020-01-01', to: '2099-01-01', sort: d.columns.at(-1)!.key, dir: 'asc' });
      expect(r.total).toBe(0);
    }
    const v = dataset('vendors')!;
    const all = await runDataset(sql, v, {});
    expect(all.total).toBeGreaterThan(0);
    // An unknown sort column or status is ignored rather than trusted.
    const odd = await runDataset(sql, v, { sort: 'business_name; drop table mkt.vendors', status: 'nonsense' });
    expect(odd.total).toBe(all.total);
  });

  it('neutralises spreadsheet formulas in CSV cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98000')).toBe(`"'+91 98000"`);
    expect(csvCell(null)).toBe('');
  });
});

describe('ops assistant', () => {
  it('accepts plain selects and rejects everything else', () => {
    expect(checkSql('select city, count(*) from ops_reports.leads group by city;')).toBe('select city, count(*) from ops_reports.leads group by city');
    expect(() => checkSql("with x as (select * from ops_reports.leads) select count(*) filter (where status = 'verified') from x")).not.toThrow();
    for (const bad of [
      'delete from ops_reports.leads',
      'select 1; select 2',
      "select set_config('role', 'postgres', false)",
      'select pg_sleep(10)',
      'select * from mkt.leads',
      'select * from pg_catalog.pg_authid',
      'select 1 -- sneaky',
      'select "phone" from ops_reports.leads',
      "select current_setting('x')",
      'select * into x from ops_reports.leads',
      "select $$x$$",
      'update ops_reports.leads set status = 1',
    ])
      expect(() => checkSql(bad), bad).toThrow();
    // Words inside string literals do not count.
    expect(() => checkSql("select count(*) from ops_reports.leads where source = 'delete me'")).not.toThrow();
  });

  it('runs as a role that can read the views and nothing else', async () => {
    const r = await runReportQuery(sql, 'select count(*)::int as n from ops_reports.vendors');
    expect(r.rows[0].n).toBeGreaterThan(0);
    // Even if a table reference slipped past the checker, the role cannot read it.
    await expect(
      sql.begin('read only', async (tx) => {
        await tx`set local role ops_assistant`;
        await tx`select count(*) from mkt.leads`;
      })
    ).rejects.toThrow(/permission denied/);
    await expect(runReportQuery(sql, 'select * from ops_reports.leads where phone is not null')).rejects.toThrow(/phone/);
  });

  it('asks Claude for SQL, runs it, explains it, logs it and counts it', async () => {
    const ops = await profile(sql, 'ops');
    process.env.ANTHROPIC_API_KEY = 'test';
    const spy = claudeSays('{"sql":"select status, count(*)::int as n from ops_reports.vendors group by status order by n desc","note":"Vendors by status"}', 'Most vendors are live.');
    const { id } = await ask(sql, ops.id, 'How many vendors are in each status?');
    const [log] = await sql<{ sql: string; answer: string; row_count: number; columns: string[] }[]>`select * from mkt.ops_assistant_log where id = ${id}`;
    expect(log.answer).toBe('Most vendors are live.');
    expect(log.columns).toEqual(['status', 'n']);
    expect(log.row_count).toBeGreaterThan(0);
    const firstPrompt = String(spy.mock.calls[0][1]!.body);
    expect(firstPrompt).toMatch(/ops_reports\.vendors/);
    expect(firstPrompt).not.toMatch(/\bphone\b|\bemail\b|bride_name/);

    // A query the model writes badly is logged as a failure, not run.
    claudeSays('{"sql":"select * from mkt.leads","note":"x"}');
    const bad = await ask(sql, ops.id, 'Show me leads');
    const [b] = await sql<{ error: string; rows: unknown }[]>`select error, rows from mkt.ops_assistant_log where id = ${bad.id}`;
    expect(b.error).toMatch(/reporting views/);
    expect(b.rows).toBeNull();

    await sql`update mkt.settings set value = '2' where key = 'ops_assistant_per_person_day'`;
    expect((await assistantAllowance(sql, ops.id)).left).toBe(0);
    await expect(ask(sql, ops.id, 'One more?')).rejects.toThrow(/limit/);
    spy.mockRestore();
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe('quote reader', () => {
  it('reads a quote once into three lists, sending nothing about the bride', async () => {
    const ops = await profile(sql, 'ops');
    const bride = await profile(sql, 'bride', 'Meher');
    const o = await profile(sql, 'vendor', 'Frames');
    const v = await liveVendor(sql, o.id, 'photographers', 'chandigarh', 'Frames');
    await topup(sql, v.id, 20);
    const lead = await createEnquiry(sql, {
      brideProfileId: bride.id,
      name: 'Meher Kaur',
      phone: '98000 22233',
      cityId: await cityId(sql, 'chandigarh'),
      needs: [{ categoryId: await categoryId(sql, 'photographers'), budgetInr: 100000 }],
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    await unlockNeed(sql, need.id, v.id, o.id);
    const [t] = await sql<{ id: string }[]>`select id from mkt.threads where lead_need_id = ${need.id}`;
    const q = await sendQuote(sql, t.id, o, 95000, 'Two days of candid and traditional photography, 400 edited photos, one album. Drone is ₹8,000 extra.');

    // Off without a key.
    expect(await readQuote(sql, q.id)).toBeNull();

    process.env.ANTHROPIC_API_KEY = 'test';
    const spy = claudeSays('{"included":["Two days of photography","400 edited photos","One album"],"extra":["Drone, ₹8,000"],"ask":["Is travel included?","When are photos delivered?"],"junk":1}');
    const r = await readQuote(sql, q.id);
    expect(r).toEqual({ included: ['Two days of photography', '400 edited photos', 'One album'], extra: ['Drone, ₹8,000'], ask: ['Is travel included?', 'When are photos delivered?'] });
    const body = String(spy.mock.calls[0][1]!.body);
    expect(body).toMatch(/Photographers|photographer/i);
    expect(body).not.toMatch(/Meher|98000|@test\.in/);
    // Read once only.
    expect(await readQuote(sql, q.id)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await readingsFor(sql, [q.id])).get(q.id)?.extra).toEqual(['Drone, ₹8,000']);
    expect((await threadQuotes(sql, t.id))[0].reading?.ask).toHaveLength(2);
    spy.mockRestore();
    delete process.env.ANTHROPIC_API_KEY;
  });
});
