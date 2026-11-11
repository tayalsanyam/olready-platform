import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { afterQuietHours, plansBehind, queuePlanNudges } from '@/lib/alerts';
import { advanceVerification, createEnquiry, reportBooking, unlockNeed } from '@/lib/leads';
import { createOrder, markOrderPaid, activateSubscription } from '@/lib/payments';
import { setVendorStatus } from '@/lib/vendors';
import { writeReview } from '@/lib/reviews';
import { getThread, markThreadRead, postMessage, unreadCount } from '@/lib/threads';
import { listCategories } from '@/lib/catalog';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  process.env.STAFF_ALERT_EMAILS = 'team@olready.test';
  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual','test')`;
  await sql`update mkt.settings set value = '0' where key in ('staff_quiet_from_hour', 'staff_quiet_to_hour')`;
});

const mail = (to: string) => sql<{ template: string; payload: Record<string, string> }[]>`select template, payload from mkt.email_outbox where to_email = ${to} order by created_at`;
const templates = async (to: string) => (await mail(to)).map((m) => m.template);

describe('who hears what, and when', () => {
  it('holds team alerts during quiet hours, in India time', () => {
    // 23:30 IST on the 10th is 18:00 UTC; quiet 21 to 9 means it goes at 9:00 IST on the 11th (03:30 UTC).
    expect(afterQuietHours(new Date('2026-11-10T18:00:00Z'), 21, 9).toISOString()).toBe('2026-11-11T03:30:00.000Z');
    // 02:00 IST is still quiet; 9:00 the same morning.
    expect(afterQuietHours(new Date('2026-11-10T20:30:00Z'), 21, 9).toISOString()).toBe('2026-11-11T03:30:00.000Z');
    // Midday goes straight away, and equal hours means no quiet time.
    const noon = new Date('2026-11-10T06:30:00Z');
    expect(afterQuietHours(noon, 21, 9)).toBe(noon);
    expect(afterQuietHours(new Date('2026-11-10T18:00:00Z'), 0, 0).toISOString()).toBe('2026-11-10T18:00:00.000Z');
  });

  it('follows a request from received to booked, and a plan from payment to a usage nudge', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const cats = await listCategories(sql, { activeOnly: true });
    const makeup = cats.find((c) => c.slug === 'bridal-makeup')!;
    const ops = await profile(sql, 'admin', 'Admin');
    const owner = await profile(sql, 'vendor', 'Glow Studio');
    const bride = await profile(sql, 'bride', 'Simran Kaur');
    const [{ email: vendorEmail }] = await sql<{ email: string }[]>`select email from mkt.profiles where id = ${owner.id}`;
    const [{ email: brideEmail }] = await sql<{ email: string }[]>`select email from mkt.profiles where id = ${bride.id}`;
    const v = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Glow Studio');

    // Profile approved.
    await setVendorStatus(sql, v.id, { status: 'suspended' }, ops.id);
    await setVendorStatus(sql, v.id, { status: 'live' }, ops.id);
    expect(await templates(vendorEmail)).toEqual(['vendor_profile_paused', 'vendor_profile_live']);

    // She sends a request: she gets an acknowledgement, the team an alert.
    const lead = await createEnquiry(sql, { brideProfileId: bride.id, name: 'Simran Kaur', phone: '9876512345', email: brideEmail, cityId: chd, eventDate: '2027-02-14', needs: [{ categoryId: makeup.id }] });
    expect(await templates(brideEmail)).toEqual(['request_received']);
    const team = await mail('team@olready.test');
    expect(team.map((m) => m.payload.what)).toContain('New request to verify');
    expect(team.find((m) => m.payload.what === 'New request to verify')!.payload.link).toContain(`/ops/leads/${lead.id}`);
    // A lead the team typed in themselves does not alert the team or email the bride.
    await createEnquiry(sql, { name: 'Walk In', phone: '9876512346', email: 'walkin@example.com', cityId: chd, source: 'ops', needs: [{ categoryId: makeup.id }] });
    expect(await templates('walkin@example.com')).toEqual([]);

    // The vendor buys a plan by bank transfer: team alert, then payment email, then plan-started once the contract is in.
    const [plan] = await sql<{ id: number; credits: number; requires_contract: boolean }[]>`select id, credits, requires_contract from mkt.packs where kind = 'plan' and active order by price_inr limit 1`;
    const { order } = await createOrder(sql, { profileId: owner.id, vendorId: v.id, packId: plan.id, gateway: 'manual' });
    expect((await mail('team@olready.test')).map((m) => m.payload.what)).toContain('Bank transfer to confirm');
    await markOrderPaid(sql, order.id, 'utr1', ops.id);
    await markOrderPaid(sql, order.id, 'utr1', ops.id); // a second confirmation sends nothing more
    const paid = (await mail(vendorEmail)).filter((m) => m.template === 'payment_received');
    expect(paid).toHaveLength(1);
    expect(paid[0].payload.invoice).toMatch(/\/invoices\//);
    expect(paid[0].payload.next).toMatch(plan.requires_contract ? /signed contract/ : /active/);
    if (plan.requires_contract) {
      expect((await mail('team@olready.test')).map((m) => m.payload.what)).toContain('Plan paid, waiting for contract');
      const [sub] = await sql<{ id: string }[]>`select id from mkt.vendor_subscriptions where order_id = ${order.id}`;
      await activateSubscription(sql, sub.id, '', 'https://example.com/contract.pdf', ops.id);
    }
    const started = (await mail(vendorEmail)).filter((m) => m.template === 'plan_started');
    expect(started).toHaveLength(1);
    expect(Number(started[0].payload.credits)).toBe(plan.credits);

    // Verified, unlocked, a message each way: unread counts follow.
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    const { threadId } = await unlockNeed(sql, need.id, v.id, owner.id);
    await postMessage(sql, threadId, { id: owner.id, role: 'vendor' }, 'Hello Simran, we are free on your date.');
    expect(await unreadCount(sql, { brideProfileId: bride.id })).toBe(1);
    expect(await unreadCount(sql, { vendorId: v.id })).toBe(0);
    await markThreadRead(sql, threadId, 'bride');
    expect(await unreadCount(sql, { brideProfileId: bride.id })).toBe(0);
    await postMessage(sql, threadId, { id: bride.id, role: 'bride' }, 'Lovely, what is your price?');
    expect((await getThread(sql, threadId))!.unread_vendor).toBe(1);

    // A fresh plan is on pace. Two-thirds of the way through with one enquiry used, it is behind.
    expect(await plansBehind(sql)).toEqual([]);
    await sql`update mkt.vendor_subscriptions set starts_at = now() - interval '60 days', ends_at = now() + interval '30 days' where vendor_id = ${v.id}`;
    const [behind] = await plansBehind(sql);
    expect(behind).toMatchObject({ vendor_id: v.id, used: 1, credits: plan.credits, days_left: 30 });
    expect(behind.expected).toBe(Math.round((plan.credits * 60) / 90));
    expect(await queuePlanNudges(sql)).toBe(1);
    await queuePlanNudges(sql); // the same fortnight: no second email
    const nudges = (await mail(vendorEmail)).filter((m) => m.template === 'plan_usage_low');
    expect(nudges).toHaveLength(1);
    expect(nudges[0].payload).toMatchObject({ used: 1, credits: plan.credits, daysLeft: 30 });

    // Booking: both sides hear. Review: the vendor hears.
    await reportBooking(sql, { needId: need.id, vendorId: v.id, reporterProfileId: bride.id, side: 'bride' });
    expect(await templates(brideEmail)).toContain('booking_confirmed');
    expect(await templates(vendorEmail)).toContain('booking_recorded_vendor');
    await writeReview(sql, { vendorId: v.id, profileId: bride.id, ratingArtist: 5, ratingService: 4, body: 'Wonderful work.' });
    const review = (await mail(vendorEmail)).find((m) => m.template === 'review_received')!;
    expect(review.payload).toMatchObject({ by: 'Simran', stars: 4.5 });
  });

  it('lets an admin choose who gets team alerts', async () => {
    const { saveStaffRecipients, staffRecipients, staffAlert } = await import('@/lib/alerts');
    const admin = await profile(sql, 'admin', 'Admin Three');
    expect((await staffRecipients(sql)).emails).toEqual(['team@olready.test']); // the environment, until a list is saved
    await expect(saveStaffRecipients(sql, { emails: 'not-an-email', phones: '' }, admin.id)).rejects.toThrow(/"not-an-email" is not an email/);
    await expect(saveStaffRecipients(sql, { emails: '', phones: '12345' }, admin.id)).rejects.toThrow(/not an Indian mobile/);
    const saved = await saveStaffRecipients(sql, { emails: 'Ops@OLReady.test\nkanika@olready.test, ops@olready.test', phones: '98765 43210\n+91 98765 43210' }, admin.id);
    expect(saved).toEqual({ emails: ['ops@olready.test', 'kanika@olready.test'], phones: ['+919876543210'] });
    await staffAlert(sql, 'transfer', 'Only for the new list', '/ops/payments', 'transfer:test');
    expect((await mail('kanika@olready.test')).map((m) => m.payload.what)).toEqual(['Bank transfer to confirm']);
    expect(await mail('team@olready.test').then((m) => m.filter((x) => x.payload.detail === 'Only for the new list'))).toEqual([]);
    // An empty saved list means nobody, not the environment's list again.
    await saveStaffRecipients(sql, { emails: '', phones: '' }, admin.id);
    expect(await staffRecipients(sql)).toEqual({ emails: [], phones: [] });
  });

  it('warns a vendor when few enquiries are left, once a week', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const cats = await listCategories(sql, { activeOnly: true });
    const photo = cats.find((c) => c.slug === 'photographers')!;
    const ops = await profile(sql, 'admin', 'Admin Two');
    const owner = await profile(sql, 'vendor', 'Lens Co');
    const [{ email }] = await sql<{ email: string }[]>`select email from mkt.profiles where id = ${owner.id}`;
    const v = await liveVendor(sql, owner.id, 'photographers', 'chandigarh', 'Lens Co');
    const [{ cost }] = await sql<{ cost: number }[]>`select unlock_credit_cost as cost from mkt.categories where id = ${photo.id}`;
    await topup(sql, v.id, cost * 2 + 3);
    for (const phone of ['9876533331', '9876533332']) {
      const lead = await createEnquiry(sql, { name: 'Bride', phone, cityId: chd, needs: [{ categoryId: photo.id }] });
      for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
      const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
      await unlockNeed(sql, need.id, v.id, owner.id);
    }
    const low = (await mail(email)).filter((m) => m.template === 'credits_low');
    expect(low).toHaveLength(1);
    expect(Number(low[0].payload.left)).toBe(3);
  });
});
