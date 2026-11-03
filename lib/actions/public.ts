'use server';

import { sql } from '../db';
import { DomainError } from '../db';
import { currentProfile } from '../auth';
import { createEnquiry, normalisePhone } from '../leads';
import { getVendorBySlug } from '../vendors';
import { toggleShortlist, weddingFor } from '../weddings';
import { acceptClaim } from '../vendors';
import { saveRsvp } from '../weddings';
import { attempt, back, num, str } from './run';

export async function submitEnquiry(fd: FormData) {
  await attempt(back(fd, '/enquire'), async () => {
    // Bots fill every field, including this one, which people never see.
    if (str(fd, 'company')) return '/enquire/thanks';
    const phone = normalisePhone(str(fd, 'phone'));
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from mkt.leads where phone = ${phone} and created_at > now() - interval '24 hours'`;
    if (n >= 3) throw new DomainError('too_many', 'We already have your requests from today. Our team will call you shortly.');
    const profile = await currentProfile();
    const wedding = profile ? await weddingFor(sql, profile.id) : null;
    const cityId = num(fd, 'city_id');
    if (!cityId) throw new DomainError('no_city', 'Choose your wedding city');
    const directSlug = str(fd, 'vendor');
    const direct = directSlug ? await getVendorBySlug(sql, directSlug) : null;
    const categoryIds = fd.getAll('category_id').map(Number).filter(Boolean);
    // "Also let others quote": an open request that this vendor sees first, flagged as chosen.
    const alsoOthers = Boolean(direct) && fd.get('also_others') === 'on';
    const needs = direct
      ? [{ categoryId: direct.category_id, budgetInr: num(fd, `budget_${direct.category_id}`), preferredVendorIds: alsoOthers ? [direct.id] : [] }]
      : categoryIds.map((id) => ({ categoryId: id, budgetInr: num(fd, `budget_${id}`) }));
    const email = str(fd, 'email') || profile?.email || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError('bad_email', 'Check your email address');
    await createEnquiry(sql, {
      brideProfileId: profile?.role === 'bride' ? profile.id : null,
      weddingId: profile?.role === 'bride' ? (wedding?.id ?? null) : null,
      name: str(fd, 'name'),
      phone: str(fd, 'phone'),
      email,
      cityId,
      eventDate: str(fd, 'event_date') || null,
      guestCount: Number(str(fd, 'guest_count')) || null,
      needs,
      directVendorId: alsoOthers ? null : (direct?.id ?? null),
      whatsappOptIn: fd.get('whatsapp') === 'on',
    });
    return '/enquire/thanks';
  });
}

export async function shortlistAction(fd: FormData) {
  const slug = str(fd, 'slug');
  const returnTo = back(fd, `/v/${slug}`);
  await attempt(returnTo, async () => {
    const profile = await currentProfile();
    if (!profile) return `/login?next=${encodeURIComponent(returnTo)}`;
    if (profile.role !== 'bride') throw new DomainError('not_bride', 'Shortlists are for brides and families');
    const wedding = await weddingFor(sql, profile.id);
    if (!wedding) return { to: '/me', ok: 'Set up your wedding first, then shortlist vendors' };
    const v = await getVendorBySlug(sql, slug);
    if (!v || v.status !== 'live') throw new DomainError('not_found', 'Vendor not found');
    const added = await toggleShortlist(sql, wedding.id, v.id, profile.id);
    return { ok: added ? 'Added to your shortlist' : 'Removed from your shortlist' };
  });
}

export async function claimAction(fd: FormData) {
  const token = str(fd, 'token');
  await attempt(`/claim/${token}`, async () => {
    const profile = await currentProfile();
    if (!profile) return `/login?next=${encodeURIComponent(`/claim/${token}`)}`;
    await acceptClaim(sql, token, profile.id);
    return { ok: 'Thanks. Our team will check and approve your claim shortly.' };
  });
}

export async function rsvpAction(fd: FormData) {
  const token = str(fd, 'token');
  await attempt(`/rsvp/${token}`, async () => {
    const answers = fd
      .getAll('event_id')
      .map(String)
      .map((eventId) => ({ eventId, response: str(fd, `r_${eventId}`), headcount: num(fd, `h_${eventId}`) ?? 1 }));
    await saveRsvp(sql, token, answers);
    return { ok: 'Thank you, your reply is saved. You can change it any time from this link.' };
  });
}
