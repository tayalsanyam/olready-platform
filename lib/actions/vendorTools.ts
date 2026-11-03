'use server';

import { DomainError, sql } from '../db';
import { currentProfile, requireProfile, requireRole } from '../auth';
import { requireVendor } from '../vendorSession';
import { closeCallback, createReviewRequest, decidePendingReview, requestCallback, submitInvitedReview } from '../vendorTools';
import { attempt, back, num, str } from './run';

export async function vendorRequestReview(fd: FormData) {
  await attempt(back(fd, '/vendor/reviews'), async () => {
    const { profile, vendor } = await requireVendor('/vendor/reviews');
    await createReviewRequest(sql, vendor, profile, str(fd, 'client_name'), str(fd, 'client_email'));
    return { ok: `Review link sent to ${str(fd, 'client_email')}` };
  });
}

export async function submitInvitedReviewAction(fd: FormData) {
  const token = str(fd, 'token');
  await attempt(`/review/${token}`, async () => {
    const p = await currentProfile();
    if (!p) return `/login?next=${encodeURIComponent(`/review/${token}`)}`;
    await submitInvitedReview(sql, token, p, {
      ratingArtist: num(fd, 'rating_artist') ?? 0,
      ratingService: num(fd, 'rating_service') ?? 0,
      body: str(fd, 'body'),
    });
    return { ok: 'Thank you. Your review will appear once our team has checked it.' };
  });
}

export async function requestCallbackAction(fd: FormData) {
  await attempt(back(fd, '/'), async () => {
    const p = await requireProfile();
    let vendorId: string | null = null;
    if (p.role === 'vendor') {
      const [v] = await sql<{ id: string }[]>`select id from mkt.vendors where owner_profile_id = ${p.id} limit 1`;
      vendorId = v?.id ?? null;
    }
    await requestCallback(sql, p, { vendorId, topic: str(fd, 'topic'), phone: str(fd, 'phone'), when: str(fd, 'when'), note: str(fd, 'note') });
    return { ok: 'Thanks. We will call you soon.' };
  });
}

export async function opsCloseCallback(fd: FormData) {
  await attempt(back(fd, '/ops'), async () => {
    const p = await requireRole(['ops', 'admin', 'rm']);
    await closeCallback(sql, str(fd, 'id'), str(fd, 'outcome'), p.id);
    return { ok: 'Call marked done' };
  });
}

export async function opsDecideInvitedReview(fd: FormData) {
  await attempt(back(fd, '/ops/reviews'), async () => {
    const p = await requireRole(['ops', 'admin']);
    const publish = str(fd, 'publish') === '1';
    if (!str(fd, 'review_id')) throw new DomainError('bad', 'Missing review');
    await decidePendingReview(sql, str(fd, 'review_id'), publish, p.id);
    return { ok: publish ? 'Review published' : 'Review removed' };
  });
}
