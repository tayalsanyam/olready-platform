import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { functionsFromForm, headline, leadFunctions, needFunctions, opsSaveFunction, weddingFunctions } from '@/lib/functions';
import { advanceVerification, createEnquiry, unlockNeed, visibleNeeds } from '@/lib/leads';
import { getThread, sendQuote, threadQuotes } from '@/lib/threads';
import { createWedding, events } from '@/lib/weddings';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

describe('big days', () => {
  it('reads functions and per-category picks from the form', () => {
    const { fns, forCategory } = functionsFromForm(
      form({
        fn_name_0: 'Mehendi', fn_date_0: '2027-02-12', fn_guests_0: '150',
        fn_name_1: '', // an empty row is skipped
        fn_name_2: 'Wedding', fn_date_2: '2027-02-14', fn_guests_2: '500',
        fn_name_3: 'Reception', fn_guests_3: '1,200',
        fn_for_7: ['0', '2'],
      })
    );
    expect(fns.map((f) => f.name)).toEqual(['Mehendi', 'Wedding', 'Reception']);
    expect(fns[2].guests).toBe(1200);
    expect(forCategory(7)).toEqual([0, 1]); // rows 0 and 2 are functions 0 and 1
    expect(forCategory(9)).toEqual([0, 1, 2]); // nothing ticked means all
    expect(headline(fns)).toEqual({ date: '2027-02-14', guests: 1200 }); // the main ceremony, the biggest crowd
    expect(() => functionsFromForm(form({ fn_name_0: 'Haldi', fn_date_0: '14/02/2027' }))).toThrow(/date for Haldi/);
  });

  it('carries functions from the request to the lead card, the chat, the quote and the wedding plan', async () => {
    const ops = await profile(sql, 'ops');
    const bride = await profile(sql, 'bride', 'Jasleen');
    const w = await createWedding(sql, bride.id, { title: 'Jasleen weds Arman' });
    const mua = await categoryId(sql, 'bridal-makeup');
    const venue = await categoryId(sql, 'venues');
    const lead = await createEnquiry(sql, {
      brideProfileId: bride.id,
      weddingId: w.id,
      name: 'Jasleen Kaur',
      phone: '98000 33344',
      cityId: await cityId(sql, 'mohali'),
      functions: [
        { name: 'Mehendi', date: '2027-02-12', guests: 150 },
        { name: 'Anand Karaj', date: '2027-02-14', guests: 400 },
        { name: 'Reception', date: '2027-02-14', guests: 800 },
      ],
      needs: [
        { categoryId: mua, functions: [0, 1] }, // makeup for the mehendi and the anand karaj
        { categoryId: venue, functions: [2] }, // a venue only for the reception
      ],
    });
    const [l] = await sql<{ event_date: string; guest_count: number }[]>`select to_char(event_date, 'YYYY-MM-DD') as event_date, guest_count from mkt.leads where id = ${lead.id}`;
    expect(l).toEqual({ event_date: '2027-02-14', guest_count: 800 });
    const needs = await sql<{ id: string; category_id: number }[]>`select id, category_id from mkt.lead_needs where lead_id = ${lead.id}`;
    const byNeed = await needFunctions(sql, needs.map((n) => n.id));
    const muaNeed = needs.find((n) => n.category_id === mua)!;
    expect(byNeed.get(muaNeed.id)!.map((f) => f.name)).toEqual(['Mehendi', 'Anand Karaj']);
    expect(byNeed.get(needs.find((n) => n.category_id === venue)!.id)!.map((f) => f.name)).toEqual(['Reception']);

    // Her plan takes the dates: the default Mehendi gets its date; the Anand Karaj and Reception are added.
    const planned = await events(sql, w.id);
    expect(planned.map((e) => e.name)).toEqual(expect.arrayContaining(['Mehendi', 'Anand Karaj', 'Reception']));
    expect((await weddingFunctions(sql, w.id)).find((f) => f.name === 'Mehendi')).toEqual({ name: 'Mehendi', date: '2027-02-12', guests: null });

    // Ops adds the Sangeet on the call, for makeup only.
    await opsSaveFunction(sql, lead.id, { name: 'Sangeet', date: '2027-02-13', guests: 300, needIds: [muaNeed.id] }, ops.id);
    expect((await leadFunctions(sql, lead.id)).map((f) => f.name)).toEqual(['Mehendi', 'Sangeet', 'Anand Karaj', 'Reception']);

    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const o = await profile(sql, 'vendor', 'Big Day Glam');
    const v = await liveVendor(sql, o.id, 'bridal-makeup', 'mohali', 'Big Day Glam');
    await topup(sql, v.id, 10);
    expect((await visibleNeeds(sql, v.id)).map((n) => n.need_id)).toContain(muaNeed.id);
    await unlockNeed(sql, muaNeed.id, v.id, o.id);
    const [t] = await sql<{ id: string }[]>`select id from mkt.threads where lead_need_id = ${muaNeed.id}`;
    const thread = await getThread(sql, t.id);
    expect(thread!.functions!.map((f) => f.name)).toEqual(['Mehendi', 'Sangeet', 'Anand Karaj']);

    // Priced per function: the total is the sum.
    const q = await sendQuote(sql, t.id, o, 0, 'HD makeup, hair and draping each day', [
      { label: 'Mehendi', amount: 12000 },
      { label: 'Sangeet', amount: 15000 },
      { label: 'Anand Karaj', amount: 28000 },
      { label: 'Empty', amount: 0 },
    ]);
    const [quote] = await threadQuotes(sql, t.id);
    expect(quote.id).toBe(q.id);
    expect(quote.amount_inr).toBe(55000);
    expect(quote.lines!.map((x) => x.label)).toEqual(['Mehendi', 'Sangeet', 'Anand Karaj']);
  });

  it('stops offering a request once its last function has passed', async () => {
    const ops = await profile(sql, 'ops');
    const lead = await createEnquiry(sql, {
      name: 'Past Bride',
      phone: '98000 55566',
      cityId: await cityId(sql, 'mohali'),
      functions: [{ name: 'Wedding', date: '2020-01-01', guests: 100 }],
      needs: [{ categoryId: await categoryId(sql, 'photographers') }],
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const o = await profile(sql, 'vendor', 'Late Lens');
    const v = await liveVendor(sql, o.id, 'photographers', 'mohali', 'Late Lens');
    const [n] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    expect((await visibleNeeds(sql, v.id)).map((x) => x.need_id)).not.toContain(n.id);
  });
});
