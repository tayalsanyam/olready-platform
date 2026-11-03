'use server';

import { saveWeddingInvite } from '../invites';
import { filesFrom, storeImage } from '../storage';

import { redirect } from 'next/navigation';
import { sql, DomainError, getSetting } from '../db';
import { buyRm, engagementFromPerk } from '../rm';
import type { Gateway } from '../payments';
import { requireProfile } from '../auth';
import { activatePerk, closeNeedByBride, reportBooking } from '../leads';
import { threadAccess } from '../threads';
import {
  addChecklistItem,
  addEvent,
  addGuests,
  askShortlisted,
  createWedding,
  joinWedding,
  toggleChecklist,
  toggleShortlist,
  updateWedding,
  weddingFor,
} from '../weddings';
import { writeReview } from '../reviews';
import { attempt, back, num, str, requireTerms } from './run';
import { LEGAL_VERSION } from '../legal';

async function requireBride(next = '/me') {
  const p = await requireProfile(next);
  if (p.role !== 'bride') redirect(p.role === 'vendor' ? '/vendor' : '/ops');
  return p;
}

async function requireWedding(next = '/me') {
  const p = await requireBride(next);
  const w = await weddingFor(sql, p.id);
  if (!w) throw new DomainError('no_wedding', 'Set up your wedding first');
  return { p, w };
}

export async function saveWeddingAction(fd: FormData) {
  await attempt('/me', async () => {
    const p = await requireBride();
    const input = {
      title: str(fd, 'title'),
      partnerName: str(fd, 'partner_name'),
      weddingDate: str(fd, 'wedding_date') || null,
      cityId: num(fd, 'city_id'),
    };
    if (str(fd, 'full_name')) await sql`update mkt.profiles set full_name = ${str(fd, 'full_name')} where id = ${p.id}`;
    await sql`update mkt.profiles set notify_email = ${fd.get('notify_email') === 'on'} where id = ${p.id}`;
    if (fd.get('whatsapp_shown')) {
      const wa = fd.get('whatsapp_opt_in') === 'on';
      await sql`
        update mkt.leads set whatsapp_opt_in = ${wa}, whatsapp_opt_in_at = case when ${wa} and not whatsapp_opt_in then now() else whatsapp_opt_in_at end
        where bride_profile_id = ${p.id} and whatsapp_opt_in <> ${wa}`;
    }
    const w = await weddingFor(sql, p.id);
    if (w) await updateWedding(sql, w.id, p.id, input);
    else await createWedding(sql, p.id, input);
    // Earlier enquiries from this bride join her wedding workspace.
    const w2 = await weddingFor(sql, p.id);
    await sql`update mkt.leads set wedding_id = ${w2!.id} where bride_profile_id = ${p.id} and wedding_id is null`;
    return { ok: 'Saved' };
  });
}

export async function brideReportBooking(fd: FormData) {
  const threadId = str(fd, 'thread_id');
  await attempt(`/me/threads/${threadId}`, async () => {
    const p = await requireBride();
    const access = await threadAccess(sql, threadId, p);
    if (access.side !== 'bride') throw new DomainError('forbidden', 'Not your conversation');
    const [t] = await sql<{ lead_need_id: string; vendor_id: string }[]>`select lead_need_id, vendor_id from mkt.threads where id = ${threadId}`;
    await reportBooking(sql, { needId: t.lead_need_id, vendorId: t.vendor_id, reporterProfileId: p.id, side: 'bride', amountInr: num(fd, 'amount_inr') });
    return { ok: 'Congratulations! Your relationship-manager perk is ready under My wedding.' };
  });
}

export async function closeNeedAction(fd: FormData) {
  await attempt('/me', async () => {
    const p = await requireBride();
    const outside = str(fd, 'outside_vendor');
    await closeNeedByBride(sql, str(fd, 'need_id'), p.id, outside ? { vendorName: outside, reason: str(fd, 'reason') } : null);
    return { ok: 'Updated. Vendors will stop seeing this category.' };
  });
}

export async function activatePerkAction(fd: FormData) {
  await attempt('/me', async () => {
    const p = await requireBride();
    const w = await weddingFor(sql, p.id);
    const days = await getSetting(sql, 'bride_perk_length_days', 7);
    await sql.begin(async (tx) => {
      await activatePerk(tx, str(fd, 'perk_id'), p.id);
      await engagementFromPerk(tx, p.id, str(fd, 'perk_id'), w?.id ?? null, days);
    });
    return { to: '/me/rm', ok: 'Your relationship manager will call you within one working day.' };
  });
}

export async function buyRmAction(fd: FormData) {
  await attempt('/me/rm', async () => {
    const p = await requireBride('/me/rm');
    requireTerms(fd);
    const w = await weddingFor(sql, p.id);
    const order = await buyRm(sql, { profileId: p.id, weddingId: w?.id ?? null, gateway: str(fd, 'gateway') as Gateway, coupon: str(fd, 'coupon') || null });
    await sql`update mkt.orders set terms_version = ${LEGAL_VERSION} where id = ${order.id}`;
    return `/pay/${order.id}`;
  });
}

export async function toggleChecklistAction(fd: FormData) {
  await attempt('/me/checklist', async () => {
    const p = await requireBride('/me/checklist');
    await toggleChecklist(sql, str(fd, 'item_id'), p.id);
  });
}

export async function addChecklistAction(fd: FormData) {
  await attempt('/me/checklist', async () => {
    const { p, w } = await requireWedding('/me/checklist');
    await addChecklistItem(sql, w.id, p.id, str(fd, 'title'), str(fd, 'due_date') || null);
  });
}

export async function addEventAction(fd: FormData) {
  await attempt('/me/guests', async () => {
    const { p, w } = await requireWedding('/me/guests');
    const date = str(fd, 'starts_at');
    await addEvent(sql, w.id, p.id, str(fd, 'name'), date ? `${date}+05:30` : null, str(fd, 'venue'));
    return { ok: 'Event added' };
  });
}

export async function addGuestsAction(fd: FormData) {
  await attempt('/me/guests', async () => {
    const { p, w } = await requireWedding('/me/guests');
    const side = (['bride', 'groom', 'common'].includes(str(fd, 'side')) ? str(fd, 'side') : 'common') as 'bride' | 'groom' | 'common';
    const n = await addGuests(sql, w.id, p.id, str(fd, 'lines'), side, str(fd, 'group'));
    return { ok: `Added ${n} guest${n === 1 ? '' : 's'}` };
  });
}

export async function saveInviteAction(fd: FormData) {
  const kind = str(fd, 'kind') === 'save_the_date' ? 'save_the_date' : 'card';
  const back = `/me/invite${kind === 'save_the_date' ? '?kind=save_the_date' : ''}`;
  await attempt(back, async () => {
    const { p, w } = await requireWedding('/me/invite');
    const f = fd.get('photo');
    const photoUrl = f instanceof File && f.size > 0 ? await storeImage(f, 'invites') : null;
    await saveWeddingInvite(sql, w.id, p.id, {
      kind,
      templateCode: str(fd, 'design'),
      opening: str(fd, 'opening'),
      bride: str(fd, 'bride'),
      groom: str(fd, 'groom'),
      family: str(fd, 'family'),
      message: str(fd, 'message'),
      photoUrl,
      publish: fd.get('publish') === 'on',
    });
    return { ok: fd.get('publish') === 'on' ? 'Invite saved and published' : 'Invite saved (not published yet)' };
  });
}

export async function removeShortlistAction(fd: FormData) {
  await attempt('/me/shortlist', async () => {
    const { p, w } = await requireWedding('/me/shortlist');
    await toggleShortlist(sql, w.id, str(fd, 'vendor_id'), p.id);
  });
}

export async function askShortlistedAction(fd: FormData) {
  await attempt('/me/shortlist', async () => {
    const { p, w } = await requireWedding('/me/shortlist');
    await askShortlisted(sql, w.id, p, str(fd, 'phone'));
    return { to: '/me', ok: 'Request sent. We will call to confirm, then your shortlisted vendors see it first.' };
  });
}

export async function joinWeddingAction(fd: FormData) {
  await attempt('/me/family', async () => {
    const p = await requireBride('/me/family');
    const role = (['partner', 'family', 'planner'].includes(str(fd, 'role')) ? str(fd, 'role') : 'family') as 'partner' | 'family' | 'planner';
    await joinWedding(sql, str(fd, 'code'), p.id, role);
    return { to: '/me', ok: 'You have joined the wedding' };
  });
}

export async function writeReviewAction(fd: FormData) {
  await attempt(back(fd, '/me/reviews'), async () => {
    const p = await requireBride('/me/reviews');
    await writeReview(sql, {
      vendorId: str(fd, 'vendor_id'),
      profileId: p.id,
      ratingArtist: num(fd, 'rating_artist') ?? 0,
      ratingService: num(fd, 'rating_service') ?? 0,
      body: str(fd, 'body'),
      amountSpent: num(fd, 'amount_spent'),
      functionDate: str(fd, 'function_date') || null,
      photos: await Promise.all(filesFrom(fd, 'photos', 5).map((f) => storeImage(f, 'reviews'))),
    });
    return { ok: 'Thank you for your review' };
  });
}
