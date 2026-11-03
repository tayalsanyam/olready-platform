import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { advanceVerification, createEnquiry, unlockNeed } from '@/lib/leads';
import { postMessage, threadMessages } from '@/lib/threads';
import { moderate, moderationQueue, reportMessage } from '@/lib/moderation';
import { closeCallback, createReviewRequest, decidePendingReview, openCallbacks, requestCallback, submitInvitedReview } from '@/lib/vendorTools';
import { reviewsForVendor } from '@/lib/reviews';
import { ideaPhotos, savedRefs, setIdeaHidden, setMediaTags, toggleSaved } from '@/lib/ideas';
import { bump } from '@/lib/analytics';
import { createWedding } from '@/lib/weddings';
import { browseVendors, filtersFor } from '@/lib/vendors';
import { fieldsFor } from '@/lib/catalog';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

async function unlockedThread() {
  const ops = await profile(sql, 'ops');
  const bride = await profile(sql, 'bride', 'Kavya');
  const owner = await profile(sql, 'vendor', 'Decor owner');
  const v = await liveVendor(sql, owner.id, 'decorators', 'chandigarh', 'Bloom Decor');
  await topup(sql, v.id, 10);
  const lead = await createEnquiry(sql, {
    brideProfileId: bride.id,
    name: 'Kavya',
    phone: '98111 00011',
    cityId: await cityId(sql, 'chandigarh'),
    guestCount: 400,
    needs: [{ categoryId: await categoryId(sql, 'decorators') }],
  });
  for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
  const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
  await unlockNeed(sql, need.id, v.id, owner.id);
  const [t] = await sql<{ id: string }[]>`select id from mkt.threads where lead_need_id = ${need.id} and vendor_id = ${v.id}`;
  return { ops, bride, owner, v, lead, thread: t.id };
}

describe('chat files and moderation', () => {
  it('flags risky messages, lets the other side report, and hides for both sides', async () => {
    const { bride, owner, ops, thread, lead } = await unlockedThread();
    const [{ guest_count }] = await sql`select guest_count from mkt.leads where id = ${lead.id}`;
    expect(guest_count).toBe(400);
    await postMessage(sql, thread, owner, 'Here is our brochure', { url: '/uploads/chat/x.pdf', kind: 'pdf', name: 'brochure.pdf' });
    const risky = await postMessage(sql, thread, owner, 'Pay the advance directly to my GPay to save fees');
    const fine = await postMessage(sql, thread, bride, 'Sounds good, call me on 98111 00011');
    await expect(postMessage(sql, thread, bride, '   ')).rejects.toThrow(/Write a message/);

    let msgs = await threadMessages(sql, thread);
    expect(msgs.find((m) => m.attachment_name === 'brochure.pdf')?.attachment_kind).toBe('pdf');
    expect(msgs.find((m) => m.id === risky)?.review_status).toBe('flagged');
    expect(msgs.find((m) => m.id === fine)?.review_status).toBe('none');

    await expect(reportMessage(sql, fine, bride, 'spam', '', 'bride')).rejects.toThrow(/own message/);
    await reportMessage(sql, fine, owner, 'abuse', 'rude', 'vendor');
    const queue = await moderationQueue(sql, 'flagged');
    const item = queue.find((q) => q.id === risky)!;
    expect(item.flags).toContain('off_platform');
    expect(item.before.length).toBeGreaterThan(0);
    expect(queue.find((q) => q.id === fine)?.reports[0].reason).toBe('abuse');

    await moderate(sql, risky, 'hide', ops.id);
    await moderate(sql, fine, 'clear', ops.id);
    msgs = await threadMessages(sql, thread);
    expect(msgs.find((m) => m.id === risky)?.review_status).toBe('hidden');
    expect((await moderationQueue(sql, 'flagged')).map((q) => q.id)).not.toContain(risky);
  });
});

describe('review requests from vendors', () => {
  it('only the invited email can review, it waits for Ops, and links work once', async () => {
    const owner = await profile(sql, 'vendor', 'Venue owner');
    const v = await liveVendor(sql, owner.id, 'venues', 'mohali', 'Lake Lawn');
    const vendor = { id: v.id, business_name: 'Lake Lawn', email: 'lake@demo.in', owner_profile_id: owner.id };
    await expect(createReviewRequest(sql, vendor, owner, 'Me', owner.email)).rejects.toThrow(/not to yourself/);
    const req = await createReviewRequest(sql, vendor, owner, 'Ritu', 'Ritu@Example.com');
    await expect(createReviewRequest(sql, vendor, owner, 'Ritu', 'ritu@example.com')).rejects.toThrow(/already asked/);
    const [mail] = await sql`select template, to_email from mkt.email_outbox where dedupe_key = ${'review_request:' + req.id}`;
    expect(mail).toMatchObject({ template: 'review_request', to_email: 'ritu@example.com' });

    const stranger = await profile(sql, 'bride', 'Stranger');
    await expect(submitInvitedReview(sql, req.token, stranger, { ratingArtist: 5, ratingService: 5, body: 'x' })).rejects.toThrow(/email this link/);
    await expect(submitInvitedReview(sql, req.token, { id: owner.id, email: 'ritu@example.com' }, { ratingArtist: 5, ratingService: 5, body: '' })).rejects.toThrow(/own business/);
    const [ritu] = await sql<{ id: string; email: string }[]>`insert into mkt.profiles (email, full_name, role) values ('ritu@example.com', 'Ritu', 'bride') returning id, email`;
    const rev = await submitInvitedReview(sql, req.token, ritu, { ratingArtist: 5, ratingService: 4, body: 'Lovely lawn' });
    await expect(submitInvitedReview(sql, req.token, ritu, { ratingArtist: 5, ratingService: 4, body: '' })).rejects.toThrow(/already been used/);

    expect(await reviewsForVendor(sql, v.id)).toHaveLength(0); // pending, not shown
    const ops = await profile(sql, 'ops');
    await decidePendingReview(sql, rev.id, true, ops.id);
    const shown = await reviewsForVendor(sql, v.id);
    expect(shown).toHaveLength(1);
    expect(shown[0].verified_booking).toBe(false);
  });
});

describe('callbacks', () => {
  it('one open request per person, worked from the Ops queue', async () => {
    const owner = await profile(sql, 'vendor', 'Caller');
    await requestCallback(sql, owner, { topic: 'plans', phone: '98222 33344', when: 'after 4', note: '' });
    await expect(requestCallback(sql, owner, { topic: 'plans', phone: '98222 33344', when: '', note: '' })).rejects.toThrow(/already have/);
    await expect(requestCallback(sql, owner, { topic: 'nope', phone: '98222 33344', when: '', note: '' })).rejects.toThrow(/Pick what/);
    const open = await openCallbacks(sql);
    const mine = open.find((c) => c.phone === '+919822233344')!;
    expect(mine.preferred_time).toBe('after 4');
    const ops = await profile(sql, 'ops');
    await closeCallback(sql, mine.id, 'Explained Pro', ops.id);
    expect((await openCallbacks(sql)).find((c) => c.id === mine.id)).toBeUndefined();
  });
});

describe('ideas gallery', () => {
  it('shows tagged work from live vendors, saves to the wall, and hides on request', async () => {
    const owner = await profile(sql, 'vendor', 'Mehendi owner');
    const v = await liveVendor(sql, owner.id, 'mehendi-artists', 'chandigarh', 'Henna Lane');
    const [m] = await sql<{ id: string }[]>`insert into mkt.vendor_media (vendor_id, url) values (${v.id}, '/demo/demo-1.jpg') returning id`;
    const kept = await setMediaTags(sql, m.id, v.id, ['arabic', 'not-a-tag', 'arabic'], 'Arabic bridal');
    expect(kept).toEqual(['arabic']);
    const other = await profile(sql, 'vendor', 'Other');
    const ov = await liveVendor(sql, other.id, 'decorators', 'chandigarh', 'Other');
    await expect(setMediaTags(sql, m.id, ov.id, [], '')).rejects.toThrow(/not found/);

    const photos = await ideaPhotos(sql, { topic: 'mehendi-designs', tag: 'arabic' });
    expect(photos.map((p) => p.ref)).toContain(`v-${m.id}`);
    expect(photos[0].vendor_name).toBe('Henna Lane');

    const bride = await profile(sql, 'bride', 'Saver');
    const w = await createWedding(sql, bride.id, { title: 'Saver wedding' });
    expect(await toggleSaved(sql, w.id, 'photo', `v-${m.id}`, bride.id)).toBe(true);
    expect((await savedRefs(sql, bride.id, 'photo')).has(`v-${m.id}`)).toBe(true);
    expect(await toggleSaved(sql, w.id, 'photo', `v-${m.id}`, bride.id)).toBe(false);

    const ops = await profile(sql, 'ops');
    await setIdeaHidden(sql, `v-${m.id}`, true, ops.id);
    expect((await ideaPhotos(sql, { topic: 'mehendi-designs' })).map((p) => p.ref)).not.toContain(`v-${m.id}`);
  });
});

describe('venue filters and analytics', () => {
  it('guest-capacity ranges filter on numbers, and counters add up per day', async () => {
    const owner = await profile(sql, 'vendor', 'Venue A');
    const big = await liveVendor(sql, owner.id, 'venues', 'chandigarh', 'Big Lawn');
    const small = await liveVendor(sql, (await profile(sql, 'vendor', 'Venue B')).id, 'venues', 'chandigarh', 'Small Farm');
    await sql`update mkt.vendors set attributes = '{"venue_type":"lawn","capacity_max":1200}' where id = ${big.id}`;
    await sql`update mkt.vendors set attributes = '{"venue_type":"farmhouse","capacity_max":120}' where id = ${small.id}`;
    const cat = await categoryId(sql, 'venues');
    const filters = filtersFor(await fieldsFor(sql, cat));
    const f1000 = filters.find((f) => f.slug === '1000-guests')!;
    const fSmall = filters.find((f) => f.slug === 'under-200-guests')!;
    const city = await cityId(sql, 'chandigarh');
    expect((await browseVendors(sql, { categoryId: cat, cityId: city, filter: f1000 })).map((v) => v.id)).toEqual([big.id]);
    expect((await browseVendors(sql, { categoryId: cat, cityId: city, filter: fSmall })).map((v) => v.id)).toEqual([small.id]);

    await bump(sql, [big.id, small.id], 'impressions');
    await bump(sql, [big.id], 'impressions');
    const rows = await sql<{ vendor_id: string; impressions: number }[]>`select vendor_id, impressions from mkt.vendor_daily`;
    expect(rows.find((r) => r.vendor_id === big.id)?.impressions).toBe(2);
    expect(rows.find((r) => r.vendor_id === small.id)?.impressions).toBe(1);
  });
});
