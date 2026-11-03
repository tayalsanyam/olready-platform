import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { advanceVerification, createEnquiry, unlockNeed } from '@/lib/leads';
import { decideQuote, sendQuote } from '@/lib/threads';
import { createWedding } from '@/lib/weddings';
import { addBudgetItem, budgetSummary, canSeeBudget, setBudgetVisibility, setCategoryBudget, setTotalBudget } from '@/lib/budget';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

describe('wedding budget', () => {
  it('likely total uses bookings, then the lowest open quote, then the plan', async () => {
    const ops = await profile(sql, 'ops');
    const bride = await profile(sql, 'bride', 'Ira');
    const w = await createWedding(sql, bride.id, { title: 'Ira weds Dev' });
    const mk = async (name: string) => {
      const o = await profile(sql, 'vendor', name);
      const v = await liveVendor(sql, o.id, 'photographers', 'chandigarh', name);
      await topup(sql, v.id, 20);
      return { o, v };
    };
    const a = await mk('Lens A');
    const b2 = await mk('Lens B');
    const lead = await createEnquiry(sql, {
      brideProfileId: bride.id,
      weddingId: w.id,
      name: 'Ira',
      phone: '98000 11122',
      cityId: await cityId(sql, 'chandigarh'),
      needs: [{ categoryId: await categoryId(sql, 'photographers'), budgetInr: 100000 }, { categoryId: await categoryId(sql, 'decorators'), budgetInr: 200000 }],
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id} and category_id = ${await categoryId(sql, 'photographers')}`;
    for (const x of [a, b2]) await unlockNeed(sql, need.id, x.v.id, x.o.id);
    const threads = await sql<{ id: string; vendor_id: string }[]>`select id, vendor_id from mkt.threads where lead_need_id = ${need.id}`;
    const tA = threads.find((t) => t.vendor_id === a.v.id)!.id;
    const tB = threads.find((t) => t.vendor_id === b2.v.id)!.id;
    await sendQuote(sql, tA, a.o, 120000, 'Two days, one album');
    const qb = await sendQuote(sql, tB, b2.o, 90000, 'One day');

    await setTotalBudget(sql, w.id, bride.id, 500000);
    await addBudgetItem(sql, w.id, bride.id, { label: 'Lehenga', categoryId: null, amount: 80000, paid: 20000 });
    let s = await budgetSummary(sql, w.id);
    const photo = s.lines.find((l) => l.category_name === 'Wedding photographer')!;
    expect(photo.planned).toBe(100000);
    expect(photo.quotes).toHaveLength(2);
    expect([photo.likely, photo.source]).toEqual([90000, 'lowest_quote']);
    const decor = s.lines.find((l) => l.category_name === 'Wedding decorator')!;
    expect([decor.likely, decor.source]).toEqual([200000, 'planned']);
    expect(s.likelyTotal).toBe(90000 + 200000 + 80000);
    expect(s.paidSum).toBe(20000);

    await decideQuote(sql, qb.id, bride, true);
    await sql`update mkt.lead_needs set booked_vendor_id = ${b2.v.id}, status = 'closed_booked' where id = ${need.id}`;
    s = await budgetSummary(sql, w.id);
    expect(s.lines.find((l) => l.category_name === 'Wedding photographer')).toMatchObject({ likely: 90000, source: 'booked', booked: { vendor: 'Lens B', amount: 90000 } });
    expect(s.bookedSum).toBe(90000);

    // Plans without a request show too.
    await setCategoryBudget(sql, w.id, bride.id, await categoryId(sql, 'venues'), 900000);
    s = await budgetSummary(sql, w.id);
    expect(s.lines.find((l) => l.category_name === 'Wedding venue')?.likely).toBe(900000);
  });

  it('family see the numbers only when the couple allows it, and cannot change them', async () => {
    const bride = await profile(sql, 'bride', 'Owner');
    const aunt = await profile(sql, 'bride', 'Aunt');
    const w = await createWedding(sql, bride.id, { title: 'Private' });
    await sql`insert into mkt.wedding_members (wedding_id, profile_id, role) values (${w.id}, ${aunt.id}, 'family')`;
    expect(await canSeeBudget(sql, w.id, bride.id)).toBe(true);
    expect(await canSeeBudget(sql, w.id, aunt.id)).toBe(false);
    await expect(setTotalBudget(sql, w.id, aunt.id, 1)).rejects.toThrow(/Only the couple/);
    await expect(setBudgetVisibility(sql, w.id, aunt.id, 'family')).rejects.toThrow(/Only the person/);
    await setBudgetVisibility(sql, w.id, bride.id, 'family');
    expect(await canSeeBudget(sql, w.id, aunt.id)).toBe(true);
  });
});
