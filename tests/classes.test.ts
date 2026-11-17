import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveVendor, profile, resetDb, testSql } from './helpers';
import { classFromForm, classesForVendor, createClass, getClass, requestSeat, setClassStatus, setSignupStatus, upcomingClasses } from '@/lib/classes';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const day = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries({ title: 'Self-makeup for wedding guests', summary: 'Base, eyes and a dupatta drape.', day, time: '11:00', hours_x10: '30', seats: '2', fee_inr: '₹2,500', mode: 'in_person', level: 'beginner', venue: 'Studio, Sector 35', includes: 'Practice kit', ...over })) fd.set(k, v);
  return fd;
};

describe('classes', () => {
  it('lets a makeup artist list a class, fills seats, and tells her and the team', async () => {
    const owner = await profile(sql, 'vendor', 'Class Artist');
    const mua = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Class Artist');
    const photographer = await liveVendor(sql, (await profile(sql, 'vendor', 'Lens')).id, 'photographers', 'chandigarh', 'Lens');

    expect(() => classFromForm(form({ summary: 'Call 98765 43210 to book' }))).toThrow(/phone numbers/);
    expect(() => classFromForm(form({ day: '2020-01-01' }))).toThrow(/future/);
    expect(() => classFromForm(form({ seats: '0' }))).toThrow(/Seats/);
    const input = classFromForm(form());
    expect(input).toMatchObject({ duration_min: 180, seats: 2, fee_inr: 2500, mode: 'in_person' });
    await expect(createClass(sql, photographer.id, input)).rejects.toThrow(/makeup and mehendi/);
    const id = await createClass(sql, mua.id, input);

    const [listed] = await upcomingClasses(sql, { citySlug: 'chandigarh' });
    expect(listed).toMatchObject({ id, vendor: 'Class Artist', city: 'Chandigarh', taken: 0 });
    expect(await upcomingClasses(sql, { citySlug: 'mohali' })).toEqual([]);

    const a = await requestSeat(sql, id, { name: 'Ritu Sharma', phone: '98111 22334', note: 'Beginner' });
    expect(a).toMatchObject({ vendor: 'Class Artist', repeat: false });
    expect((await requestSeat(sql, id, { name: 'Ritu', phone: '+91 9811122334' })).repeat).toBe(true);
    await requestSeat(sql, id, { name: 'Pooja', phone: '9811122335' });
    await expect(requestSeat(sql, id, { name: 'Late', phone: '9811122336' })).rejects.toThrow(/full/);
    await expect(requestSeat(sql, id, { name: 'X', phone: '9811122337' })).rejects.toThrow(/name/);

    // The artist is emailed a first name only; the number waits behind her sign-in.
    const mails = await sql<{ payload: Record<string, unknown> }[]>`select payload from mkt.email_outbox where template = 'class_signup' order by created_at`;
    expect(mails.length).toBe(2);
    expect(JSON.stringify(mails[0].payload)).not.toContain('9811122334');
    expect(mails[0].payload).toMatchObject({ name: 'Ritu', taken: 1, seats: 2 });
    // The team sees her under Numbers to call.
    const caps = await sql<{ source: string; note: string }[]>`select source, note from mkt.captures where phone = '+919811122334'`;
    expect(caps).toEqual([{ source: 'class', note: 'Asked for a seat in "Self-makeup for wedding guests" by Class Artist.' }]);

    const [mine] = await classesForVendor(sql, mua.id);
    expect(mine.signups.map((s) => [s.name, s.phone, s.status])).toEqual([['Ritu Sharma', '+919811122334', 'new'], ['Pooja', '+919811122335', 'new']]);
    // Releasing a seat frees it; another artist cannot touch it.
    await expect(setSignupStatus(sql, photographer.id, mine.signups[1].id, 'cancelled')).rejects.toThrow(/not found/);
    await setSignupStatus(sql, mua.id, mine.signups[1].id, 'cancelled');
    await requestSeat(sql, id, { name: 'Late', phone: '9811122336' });
    expect((await getClass(sql, id))!.taken).toBe(2);

    // Hidden by Ops or cancelled by the artist: off the list and closed to requests.
    await setClassStatus(sql, id, 'hidden', {});
    expect(await upcomingClasses(sql)).toEqual([]);
    await expect(requestSeat(sql, id, { name: 'Nina', phone: '9811122338' })).rejects.toThrow(/no longer/);
    await expect(setClassStatus(sql, id, 'cancelled', { vendorId: photographer.id })).rejects.toThrow(/not found/);
    expect(await getClass(sql, 'not-an-id')).toBeNull();
  });
});
