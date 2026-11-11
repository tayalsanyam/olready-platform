import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import {
  addCalendarEntries, blockForBooking, buildIcs, calendarDaily, calendarMonth, calendarRange, checkDates, clashesForNeeds,
  dayStatuses, importCalendar, parseIcs, removeCalendarEntry, setBookingsPerDay, setImportUrl, todayIst,
} from '@/lib/availability';
import { browseVendors, countVendors } from '@/lib/vendors';
import { createEnquiry } from '@/lib/leads';
import { addSpace, spacesFor } from '@/lib/venueSpaces';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const ahead = (n: number) => new Date(Date.parse(todayIst()) + n * 864e5).toISOString().slice(0, 10);

describe('vendor calendars', () => {
  it('counts half-days against bookings a day, and closed days', async () => {
    const o = await profile(sql, 'vendor', 'Kirti');
    const v = await liveVendor(sql, o.id, 'bridal-makeup', 'chandigarh', 'Kirti Studio');
    const d = ahead(30);
    expect((await dayStatuses(sql, v.id, [d])).get(d)).toBe('free');
    await addCalendarEntries(sql, v.id, { from: d, slot: 'day', status: 'booked' }, o.id);
    expect((await dayStatuses(sql, v.id, [d])).get(d)).toBe('some'); // the evening is still open
    await addCalendarEntries(sql, v.id, { from: d, slot: 'evening', status: 'booked' }, o.id);
    expect((await dayStatuses(sql, v.id, [d])).get(d)).toBe('full');
    await setBookingsPerDay(sql, v.id, 2, o.id); // a team that can do two brides a day
    expect((await dayStatuses(sql, v.id, [d])).get(d)).toBe('some');
    await addCalendarEntries(sql, v.id, { from: ahead(31), to: ahead(33), slot: 'full', status: 'closed', note: 'Family trip' }, o.id);
    const s = await dayStatuses(sql, v.id, [ahead(31), ahead(33), ahead(34)]);
    expect([s.get(ahead(31)), s.get(ahead(33)), s.get(ahead(34))]).toEqual(['closed', 'closed', 'free']);
    const month = await calendarMonth(sql, v.id, ahead(31).slice(0, 7));
    expect(month.find((m) => m.day === ahead(31))?.entries[0].note).toBe('Family trip');
    // Removing a day frees it.
    const [entry] = await calendarRange(sql, v.id, ahead(31), ahead(31));
    await removeCalendarEntry(sql, v.id, entry.id, o.id);
    expect((await dayStatuses(sql, v.id, [ahead(31)])).get(ahead(31))).toBe('free');
    await expect(removeCalendarEntry(sql, v.id, entry.id, o.id)).rejects.toThrow(/not on your calendar/);
  });

  it('rejects past dates, long ranges and other vendors’ halls', async () => {
    const o = await profile(sql, 'vendor', 'Hall');
    const v = await liveVendor(sql, o.id, 'venues', 'mohali', 'Two Halls');
    await expect(addCalendarEntries(sql, v.id, { from: ahead(-1), slot: 'full', status: 'booked' }, o.id)).rejects.toThrow(/passed/);
    await expect(addCalendarEntries(sql, v.id, { from: ahead(1), to: ahead(80), slot: 'full', status: 'booked' }, o.id)).rejects.toThrow(/62 days/);
    await expect(addCalendarEntries(sql, v.id, { from: ahead(5), to: ahead(2), slot: 'full', status: 'booked' }, o.id)).rejects.toThrow(/before the start/);
    await expect(addCalendarEntries(sql, v.id, { from: ahead(2), slot: 'night', status: 'booked' }, o.id)).rejects.toThrow(/whole day/);
  });

  it('a venue is full only when every hall is taken; a whole-venue booking takes them all', async () => {
    const o = await profile(sql, 'vendor', 'Venue');
    const v = await liveVendor(sql, o.id, 'venues', 'chandigarh', 'Grand Venue');
    await addSpace(sql, v.id, { name: 'Crystal Hall', kind: 'indoor', seating: 400, floating: 600 });
    await addSpace(sql, v.id, { name: 'Lawn', kind: 'outdoor', seating: 800, floating: 1200 });
    const [hall] = await spacesFor(sql, v.id);
    const d = ahead(40);
    await addCalendarEntries(sql, v.id, { from: d, slot: 'full', status: 'booked', spaceId: hall.id }, o.id);
    expect((await dayStatuses(sql, v.id, [d])).get(d)).toBe('some');
    const d2 = ahead(41);
    await addCalendarEntries(sql, v.id, { from: d2, slot: 'full', status: 'booked' }, o.id);
    expect((await dayStatuses(sql, v.id, [d2])).get(d2)).toBe('full');
  });

  it('tells brides "free" only from a fresh calendar, and filters listings by date', async () => {
    const o1 = await profile(sql, 'vendor', 'A');
    const o2 = await profile(sql, 'vendor', 'B');
    const fresh = await liveVendor(sql, o1.id, 'photographers', 'panchkula', 'Fresh Frames');
    const stale = await liveVendor(sql, o2.id, 'photographers', 'panchkula', 'Stale Shots');
    const d = ahead(45);
    await addCalendarEntries(sql, fresh.id, { from: ahead(46), slot: 'full', status: 'booked' }, o1.id); // also marks it fresh
    await sql`update mkt.vendors set calendar_updated_at = now() - interval '90 days' where id = ${stale.id}`;
    const [ok] = await checkDates(sql, { id: fresh.id, calendar_updated_at: new Date() }, [d], { [d]: 'Wedding' });
    expect(ok.status).toBe('free');
    expect(ok.text).toMatch(/^Wedding, .*: free as per their calendar/);
    const [unknown] = await checkDates(sql, { id: stale.id, calendar_updated_at: new Date(Date.now() - 90 * 864e5) }, [d]);
    expect(unknown.status).toBe('unknown');
    expect(unknown.text).toMatch(/not marked/);
    const [busy] = await checkDates(sql, { id: fresh.id, calendar_updated_at: new Date() }, [ahead(46)]);
    expect(busy.tone).toBe('bad');
    const cat = await categoryId(sql, 'photographers');
    const pkl = await cityId(sql, 'panchkula');
    expect(await countVendors(sql, { categoryId: cat, cityId: pkl })).toBe(2);
    const onBusyDay = await browseVendors(sql, { categoryId: cat, cityId: pkl, freeOn: ahead(46) });
    expect(onBusyDay.map((v) => v.business_name)).toEqual(['Stale Shots']);
  });

  it('a booking fills the vendor’s calendar for its functions, and leads show clashes', async () => {
    const o = await profile(sql, 'vendor', 'Dhol');
    const v = await liveVendor(sql, o.id, 'djs-dhol', 'chandigarh', 'Dhol Masters');
    const cat = await categoryId(sql, 'djs-dhol');
    const lead = await createEnquiry(sql, {
      name: 'Simar', phone: '9811100001', cityId: await cityId(sql, 'chandigarh'),
      functions: [{ name: 'Sangeet', date: ahead(50), guests: 200 }, { name: 'Wedding', date: ahead(51), guests: 500 }],
      needs: [{ categoryId: cat, functions: [0] }],
    });
    const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    expect((await clashesForNeeds(sql, v.id, [need.id])).size).toBe(0);
    expect(await blockForBooking(sql, need.id, v.id, o.id)).toBe(1); // only the Sangeet
    expect(await blockForBooking(sql, need.id, v.id, o.id)).toBe(0); // repeats are ignored
    const s = await dayStatuses(sql, v.id, [ahead(50), ahead(51)]);
    expect([s.get(ahead(50)), s.get(ahead(51))]).toEqual(['full', 'free']);
    const clash = await clashesForNeeds(sql, v.id, [need.id]);
    expect(clash.get(need.id)?.[0]).toMatch(/^Sangeet, /);
    const [row] = await calendarRange(sql, v.id, ahead(50), ahead(50));
    expect(row).toMatchObject({ source: 'olready', status: 'booked' });
  });
});

describe('iCal feed and Google Calendar import', () => {
  it('reads all-day, multi-day and timed events as India dates, and skips cancelled ones', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'UID:a1', 'DTSTART;VALUE=DATE:20270214', 'DTEND;VALUE=DATE:20270216', 'SUMMARY:Kapoor wedding\\, two days', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:a2', 'DTSTART:20270301T200000Z', 'DTEND:20270301T230000Z', 'SUMMARY:Late', ' night shoot', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:a3', 'DTSTART;TZID=Asia/Kolkata:20270305T190000', 'SUMMARY:Sangeet', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:a4', 'DTSTART;VALUE=DATE:20270310', 'STATUS:CANCELLED', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:a5', 'DTSTART;VALUE=DATE:20200101', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const ev = parseIcs(ics, { from: '2027-01-01', to: '2027-12-31' });
    expect(ev.map((e) => [e.uid, e.days])).toEqual([
      ['a1', ['2027-02-14', '2027-02-15']],
      ['a2', ['2027-03-02']], // 20:00 UTC is 01:30 the next day in India
      ['a3', ['2027-03-05']],
    ]);
    expect(ev[0].summary).toBe('Kapoor wedding, two days');
    expect(ev[1].summary).toBe('Latenight shoot');
  });

  it('exports a feed and imports a calendar, replacing earlier imports', async () => {
    const o = await profile(sql, 'vendor', 'Sync');
    const v = await liveVendor(sql, o.id, 'decorators', 'chandigarh', 'Sync Decor');
    await addCalendarEntries(sql, v.id, { from: ahead(10), slot: 'evening', status: 'booked', note: 'Gill party' }, o.id);
    const feed = buildIcs('Sync Decor', await calendarRange(sql, v.id, ahead(0), ahead(100)));
    expect(feed).toContain('X-WR-CALNAME:Sync Decor on Olready');
    expect(feed).toContain(`DTSTART;VALUE=DATE:${ahead(10).replace(/-/g, '')}`);
    expect(feed).toContain('SUMMARY:Booked (Evening): Gill party');
    await expect(setImportUrl(sql, v.id, 'http://insecure.example/cal.ics', o.id)).rejects.toThrow(/iCal address/);
    await setImportUrl(sql, v.id, 'https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics', o.id);
    const day = ahead(20).replace(/-/g, '');
    const fake = (days: string[]) => async () =>
      ['BEGIN:VCALENDAR', ...days.flatMap((d, i) => ['BEGIN:VEVENT', `UID:e${i}`, `DTSTART;VALUE=DATE:${d}`, 'SUMMARY:Booking', 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    expect(await importCalendar(sql, v.id, fake([day]))).toBe(1);
    expect((await dayStatuses(sql, v.id, [ahead(20)])).get(ahead(20))).toBe('full');
    // The next read replaces the old one: the moved booking frees its old day.
    await importCalendar(sql, v.id, fake([ahead(22).replace(/-/g, '')]));
    const s = await dayStatuses(sql, v.id, [ahead(20), ahead(22), ahead(10)]);
    expect([s.get(ahead(20)), s.get(ahead(22)), s.get(ahead(10))]).toEqual(['free', 'full', 'some']);
    expect(await importCalendar(sql, v.id, async () => { throw new Error('answered 404'); })).toBe(-1);
    const [{ err }] = await sql<{ err: string }[]>`select calendar_import_error as err from mkt.vendors where id = ${v.id}`;
    expect(err).toMatch(/404/);
  });

  it('reminds vendors whose calendars have gone stale, once a month', async () => {
    const o = await profile(sql, 'vendor', 'Old');
    const v = await liveVendor(sql, o.id, 'mehendi-artists', 'chandigarh', 'Old Cal');
    await sql`update mkt.vendors set calendar_updated_at = now() - interval '40 days' where id = ${v.id}`;
    const reminded: string[] = [];
    await calendarDaily(sql, async (id) => void reminded.push(id));
    expect(reminded).toContain(v.id);
    const again: string[] = [];
    await calendarDaily(sql, async (id) => void again.push(id));
    expect(again).not.toContain(v.id);
  });
});
