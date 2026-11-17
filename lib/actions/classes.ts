'use server';

import { sql } from '../db';
import { requireRole } from '../auth';
import { requireVendor } from '../vendorSession';
import { classFromForm, createClass, requestSeat, setClassStatus, setSignupStatus } from '../classes';
import { visitorId } from '../visitor';
import { attempt, str } from './run';

export async function vendorAddClass(fd: FormData) {
  await attempt('/vendor/classes#new', async () => {
    const { vendor } = await requireVendor('/vendor/classes');
    await createClass(sql, vendor.id, classFromForm(fd));
    return { to: '/vendor/classes', ok: 'Class listed. It is on the Classes page now.' };
  });
}

export async function vendorCancelClass(fd: FormData) {
  await attempt('/vendor/classes', async () => {
    const { vendor } = await requireVendor('/vendor/classes');
    await setClassStatus(sql, str(fd, 'id'), 'cancelled', { vendorId: vendor.id });
    return { ok: 'Class cancelled. Tell the people who asked for a seat.' };
  });
}

export async function vendorSetSignup(fd: FormData) {
  await attempt('/vendor/classes', async () => {
    const { vendor } = await requireVendor('/vendor/classes');
    const status = str(fd, 'status') === 'confirmed' ? 'confirmed' : 'cancelled';
    await setSignupStatus(sql, vendor.id, str(fd, 'id'), status);
    return { ok: status === 'confirmed' ? 'Seat confirmed' : 'Seat released' };
  });
}

/** Anyone can ask for a seat; no account. */
export async function askForSeat(fd: FormData) {
  const id = str(fd, 'class_id');
  await attempt(`/classes/${id}#seat`, async () => {
    // People never see this field; bots fill it.
    if (str(fd, 'company')) return { ok: 'Thank you' };
    const r = await requestSeat(sql, id, { name: str(fd, 'name'), phone: str(fd, 'phone'), note: str(fd, 'note'), visitor: await visitorId().catch(() => null) });
    return { ok: r.repeat ? `We already have your request. ${r.vendor} will call you.` : `Seat requested. ${r.vendor} will call you to confirm and take the fee.` };
  });
}

export async function opsSetClass(fd: FormData) {
  await attempt('/ops/classes', async () => {
    await requireRole(['ops', 'admin', 'content']);
    const status = str(fd, 'status') === 'live' ? 'live' : 'hidden';
    await setClassStatus(sql, str(fd, 'id'), status, {});
    return { ok: status === 'live' ? 'Class is back on the site' : 'Class hidden from the site' };
  });
}
