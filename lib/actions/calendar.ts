'use server';

import { DomainError, sql } from '../db';
import { requireRole } from '../auth';
import { requireVendor } from '../vendorSession';
import { addCalendarEntries, confirmCalendar, importCalendar, removeCalendarEntry, setBookingsPerDay, setImportUrl } from '../availability';
import { attempt, back, num, str } from './run';

const where = (fd: FormData) => back(fd, '/vendor/calendar');

export async function calendarAddAction(fd: FormData) {
  await attempt(where(fd), async () => {
    const { profile, vendor } = await requireVendor('/vendor/calendar');
    const n = await addCalendarEntries(sql, vendor.id, { from: str(fd, 'from'), to: str(fd, 'to') || null, slot: str(fd, 'slot') || 'full', status: str(fd, 'status') || 'booked', spaceId: str(fd, 'space_id') || null, note: str(fd, 'note') }, profile.id);
    return { ok: n === 1 ? 'Date marked' : `${n} days marked` };
  });
}

export async function calendarRemoveAction(fd: FormData) {
  await attempt(where(fd), async () => {
    const { profile, vendor } = await requireVendor('/vendor/calendar');
    await removeCalendarEntry(sql, vendor.id, str(fd, 'entry_id'), profile.id);
    return { ok: 'Removed from your calendar' };
  });
}

export async function calendarConfirmAction(fd: FormData) {
  await attempt(where(fd), async () => {
    const { profile, vendor } = await requireVendor('/vendor/calendar');
    await confirmCalendar(sql, vendor.id, profile.id);
    return { ok: 'Thanks. Brides now see your unmarked days as free.' };
  });
}

export async function calendarCapacityAction(fd: FormData) {
  await attempt(where(fd), async () => {
    const { profile, vendor } = await requireVendor('/vendor/calendar');
    await setBookingsPerDay(sql, vendor.id, num(fd, 'bookings_per_day') ?? 1, profile.id);
    return { ok: 'Saved' };
  });
}

export async function calendarImportAction(fd: FormData) {
  await attempt(where(fd), async () => {
    const { profile, vendor } = await requireVendor('/vendor/calendar');
    const url = str(fd, 'import_url') || null;
    await setImportUrl(sql, vendor.id, url, profile.id);
    if (!url) return { ok: 'Calendar disconnected' };
    const n = await importCalendar(sql, vendor.id);
    if (n < 0) throw new DomainError('import', 'Saved, but we could not read that calendar yet. Check the address; we try again every day.');
    return { ok: `Connected. ${n} events read from your calendar.` };
  });
}

/** Ops marks dates for a vendor who called in. */
export async function opsCalendarAddAction(fd: FormData) {
  const vendorId = str(fd, 'vendor_id');
  await attempt(`/ops/vendors/${vendorId}#calendar`, async () => {
    const p = await requireRole(['ops', 'admin']);
    const n = await addCalendarEntries(sql, vendorId, { from: str(fd, 'from'), to: str(fd, 'to') || null, slot: str(fd, 'slot') || 'full', status: str(fd, 'status') || 'booked', note: str(fd, 'note') }, p.id, 'ops');
    return { ok: `${n} day${n === 1 ? '' : 's'} marked` };
  });
}
