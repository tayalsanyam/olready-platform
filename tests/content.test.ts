import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { advanceVerification, createEnquiry, unlockNeed, reportBooking, visibleNeeds } from '@/lib/leads';
import { decideDispute, expireDisputes, markContacted, openDispute, submitProof, writeReview } from '@/lib/reviews';
import { askShortlisted, createWedding, joinWedding, rsvpByToken, saveRsvp, addGuests, guests, toggleShortlist, checklist } from '@/lib/weddings';
import { moderateRealWedding, realWeddingBySlug, submitRealWedding } from '@/lib/realWeddings';
import { setVendorStatus, createVendor, inviteClaim, acceptClaim, decideClaim, vendorFaq, filtersFor, browseVendors, getVendorBySlug } from '@/lib/vendors';
import { fieldsFor, validateAttributes } from '@/lib/catalog';
import { postMessage, sendQuote, decideQuote, threadAccess } from '@/lib/threads';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

async function bookedPair() {
  const ops = await profile(sql, 'ops');
  const bride = await profile(sql, 'bride', 'Riya Sharma');
  const owner = await profile(sql, 'vendor', 'Glam Owner');
  const v = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Glam Studio');
  const lead = await createEnquiry(sql, {
    brideProfileId: bride.id, name: 'Riya Sharma', phone: '9811111111', cityId: await cityId(sql, 'chandigarh'),
    eventDate: '2026-10-20', needs: [{ categoryId: await categoryId(sql, 'bridal-makeup') }],
  });
  for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
  await topup(sql, v.id, 1);
  const [need] = await sql`select id from mkt.lead_needs where lead_id = ${lead.id}`;
  const u = await unlockNeed(sql, need.id, v.id, owner.id);
  return { ops, bride, owner, v, needId: need.id as string, threadId: u.threadId };
}

describe('vendor attributes and profiles', () => {
  it('validates fields per category', async () => {
    const fields = await fieldsFor(sql, await categoryId(sql, 'bridal-makeup'));
    expect(() => validateAttributes(fields, {})).toThrow(/Artist type is required/);
    const ok = validateAttributes(fields, { artist_type: 'studio', travels_to_venue: 'on', trial_policy: 'paid_adjusted', junk: 'x' });
    expect(ok).toMatchObject({ artist_type: 'studio', travels_to_venue: true, airbrush: false });
    expect(ok).not.toHaveProperty('junk');
    expect(() => validateAttributes(fields, { artist_type: 'robot', travels_to_venue: true, trial_policy: 'free' })).toThrow(/invalid choice/);
  });

  it('builds landing filters and FAQ from fields, and filters browse results', async () => {
    const cat = await categoryId(sql, 'bridal-makeup');
    const fields = await fieldsFor(sql, cat);
    const filters = filtersFor(fields);
    expect(filters.map((f) => f.slug)).toEqual(expect.arrayContaining(['airbrush', 'travels-to-venue', 'freelance', 'studio']));
    const owner = await profile(sql, 'vendor');
    const v = await createVendor(sql, {
      business_name: 'Airbrush Queen', category_id: cat, city_id: await cityId(sql, 'mohali'), starting_price_inr: 18000,
      attributes: { artist_type: 'freelance', airbrush: true, travels_to_venue: true, trial_policy: 'free' },
    }, { ownerProfileId: owner.id, actor: owner.id });
    await setVendorStatus(sql, v.id, { status: 'live' }, owner.id);
    const airbrush = filters.find((f) => f.slug === 'airbrush')!;
    const rows = await browseVendors(sql, { categoryId: cat, cityId: await cityId(sql, 'mohali'), filter: airbrush });
    expect(rows.map((r) => r.slug)).toContain(v.slug);
    const card = (await getVendorBySlug(sql, v.slug))!;
    const faq = vendorFaq(card, fields);
    expect(faq.find((f) => f.q.includes('airbrush'))?.a).toMatch(/^Yes/);
    expect(faq.find((f) => f.q.includes('charge'))?.a).toContain('₹18,000');
    expect(card).toHaveProperty('phone');
  });

  it('keeps Ops-built profiles private until the vendor claims them', async () => {
    const ops = await profile(sql, 'ops');
    const v = await createVendor(sql, {
      business_name: 'Unclaimed Mehendi', category_id: await categoryId(sql, 'mehendi-artists'), city_id: await cityId(sql, 'chandigarh'),
      attributes: { travels_to_venue: true },
    }, { ownerProfileId: null, actor: ops.id });
    await expect(setVendorStatus(sql, v.id, { status: 'live' }, ops.id)).rejects.toThrow(/claimed/);
    const claim = await inviteClaim(sql, v.id, 'owner@mehendi.in', ops.id);
    const owner = await profile(sql, 'bride', 'Mehendi Owner');
    await acceptClaim(sql, claim.token, owner.id);
    await decideClaim(sql, claim.id, true, ops.id);
    const [p] = await sql`select role from mkt.profiles where id = ${owner.id}`;
    expect(p.role).toBe('vendor');
    await setVendorStatus(sql, v.id, { status: 'live', verified: true }, ops.id);
    const [row] = await sql`select status, verified_at is not null as verified from mkt.vendors where id = ${v.id}`;
    expect(row).toMatchObject({ status: 'live', verified: true });
  });
});

describe('conversations and quotes', () => {
  it('lets both sides talk, the vendor quote and the bride accept', async () => {
    const { bride, owner, threadId } = await bookedPair();
    const stranger = await profile(sql, 'vendor');
    await expect(threadAccess(sql, threadId, stranger)).rejects.toThrow(/cannot open/);
    await postMessage(sql, threadId, owner, 'Hi Riya, happy to help');
    await postMessage(sql, threadId, bride, 'What is your price?');
    await expect(sendQuote(sql, threadId, bride, 20000, '')).rejects.toThrow(/Only the vendor/);
    const q = await sendQuote(sql, threadId, owner, 22000, 'Bridal + 1 family');
    await expect(decideQuote(sql, q.id, owner, true)).rejects.toThrow(/Only the bride/);
    await decideQuote(sql, q.id, bride, true);
    const [t] = await sql`select status from mkt.threads where id = ${threadId}`;
    expect(t.status).toBe('quote_accepted');
  });
});

describe('reviews and disputes', () => {
  it('needs a conversation, marks booked reviews verified, and runs the 48h/7d dispute flow', async () => {
    const { bride, owner, v, needId, ops } = await bookedPair();
    const stranger = await profile(sql, 'bride');
    await expect(writeReview(sql, { vendorId: v.id, profileId: stranger.id, ratingArtist: 1, ratingService: 1, body: 'x' })).rejects.toThrow(/talked to/);
    await reportBooking(sql, { needId, vendorId: v.id, reporterProfileId: bride.id, side: 'bride' });
    const r = await writeReview(sql, { vendorId: v.id, profileId: bride.id, ratingArtist: 2, ratingService: 3, body: 'Late by an hour' });
    const [rev] = await sql`select verified_booking, status from mkt.reviews where id = ${r.id}`;
    expect(rev).toMatchObject({ verified_booking: true, status: 'published' });

    const d = await openDispute(sql, r.id, v.id, 'Bride arrived late, not us', owner.id);
    const [d1] = await sql`select status, contact_due_at - created_at as window from mkt.review_disputes where id = ${d.id}`;
    expect(d1.status).toBe('open');
    await expect(submitProof(sql, d.id, v.id, 'chat log')).rejects.toThrow(/window is closed/);
    await markContacted(sql, d.id, ops.id);
    await submitProof(sql, d.id, v.id, 'WhatsApp log showing 6am arrival');
    await decideDispute(sql, d.id, false, 'Proof does not show timing', ops.id);
    const [rev2] = await sql`select status from mkt.reviews where id = ${r.id}`;
    expect(rev2.status).toBe('published');
  });

  it('expires disputes when no proof arrives in time', async () => {
    const { bride, v, ops, owner } = await bookedPair();
    const r = await writeReview(sql, { vendorId: v.id, profileId: bride.id, ratingArtist: 1, ratingService: 1, body: 'Bad' });
    const d = await openDispute(sql, r.id, v.id, 'Never worked with her', owner.id);
    await markContacted(sql, d.id, ops.id);
    await sql`update mkt.review_disputes set proof_due_at = now() - interval '1 minute' where id = ${d.id}`;
    expect(await expireDisputes(sql)).toBe(1);
    const [rev] = await sql`select status from mkt.reviews where id = ${r.id}`;
    expect(rev.status).toBe('published');
  });
});

describe('bride tools', () => {
  it('creates a dated checklist, lets family join, and collects RSVPs by link', async () => {
    const bride = await profile(sql, 'bride', 'Anu');
    const w = await createWedding(sql, bride.id, { title: 'Anu weds Kabir', weddingDate: '2027-03-01', cityId: await cityId(sql, 'chandigarh') });
    const items = await checklist(sql, w.id);
    expect(items.length).toBeGreaterThan(5);
    expect(items.find((i) => i.title.startsWith('Book the venue'))?.due_date).toBe('2026-06-01');
    const [{ join_code }] = await sql`select join_code from mkt.weddings where id = ${w.id}`;
    const mom = await profile(sql, 'bride', 'Mom');
    await joinWedding(sql, join_code.toLowerCase(), mom.id, 'family');
    expect(await addGuests(sql, w.id, mom.id, 'Uncle Raj, 9876512345\nAunty Neeta\n', 'bride', 'Family')).toBe(2);
    const g = await guests(sql, w.id);
    const rs = (await rsvpByToken(sql, g[0].rsvp_token))!;
    expect(rs.events).toHaveLength(3);
    await saveRsvp(sql, g[0].rsvp_token, rs.events.map((e) => ({ eventId: e.id, response: 'yes', headcount: 3 })));
    const again = (await rsvpByToken(sql, g[0].rsvp_token))!;
    expect(again.events.every((e) => e.response === 'yes' && e.headcount === 3)).toBe(true);
  });

  it('turns a shortlist into one enquiry that shortlisted vendors see first', async () => {
    const ops = await profile(sql, 'ops');
    const bride = await profile(sql, 'bride', 'Neha Gupta');
    const w = await createWedding(sql, bride.id, { weddingDate: '2027-01-10', cityId: await cityId(sql, 'chandigarh') });
    const fav = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'photographers', 'chandigarh', 'Fav Photo');
    const other = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'photographers', 'chandigarh', 'Other Photo');
    const deco = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'decorators', 'chandigarh', 'Deco');
    await toggleShortlist(sql, w.id, fav.id, bride.id);
    await toggleShortlist(sql, w.id, deco.id, bride.id);
    const lead = await askShortlisted(sql, w.id, bride, '9822222222');
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const favFeed = await visibleNeeds(sql, fav.id);
    const otherFeed = await visibleNeeds(sql, other.id);
    expect(favFeed.find((n) => n.lead_id === lead.id)?.shortlisted).toBe(true);
    expect(otherFeed.find((n) => n.lead_id === lead.id)?.shortlisted).toBe(false);
    expect(favFeed.find((n) => n.lead_id === lead.id)?.other_categories).toBe(1);
  });
});

describe('real weddings', () => {
  it('needs consent, tags vendors, and publishes only after Ops approves', async () => {
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'photographers', 'chandigarh', 'Lens Co');
    const ops = await profile(sql, 'content');
    const base = { title: 'A winter wedding', coupleNames: 'Isha & Dev', cityId: await cityId(sql, 'chandigarh'), weddingDate: '2025-12-05', story: 'Lovely', coverImageUrl: null, photoUrls: ['https://img.example/1.jpg', 'not-a-url'], vendorSlugs: [v.slug] };
    await expect(submitRealWedding(sql, owner.id, { ...base, consent: false })).rejects.toThrow(/agreed/);
    const rw = await submitRealWedding(sql, owner.id, { ...base, consent: true });
    expect(await realWeddingBySlug(sql, rw.slug)).toBeNull();
    await moderateRealWedding(sql, rw.id, true, '', ops.id);
    const pub = (await realWeddingBySlug(sql, rw.slug))!;
    expect(pub.photos).toHaveLength(1);
    expect(pub.vendors).toEqual([expect.objectContaining({ slug: v.slug, vendor_confirmed: true })]);
  });
});

describe('notifications', () => {
  it('queues one new-lead email per eligible vendor and deduplicates messages per hour', async () => {
    const { notifyNewLead, notifyMessage } = await import('@/lib/notify');
    const ops = await profile(sql, 'ops');
    const bride = await profile(sql, 'bride', 'Mehak Arora');
    const owner = await profile(sql, 'vendor', 'Notify Owner');
    const v = await liveVendor(sql, owner.id, 'djs-dhol', 'chandigarh', 'Notify DJ');
    const far = await liveVendor(sql, (await profile(sql, 'vendor')).id, 'djs-dhol', 'ludhiana', 'Far DJ');
    const lead = await createEnquiry(sql, {
      brideProfileId: bride.id, name: 'Mehak Arora', phone: '9833333333', email: 'mehak@demo.in', cityId: await cityId(sql, 'chandigarh'),
      needs: [{ categoryId: await categoryId(sql, 'djs-dhol') }],
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    await notifyNewLead(sql, lead.id);
    await notifyNewLead(sql, lead.id);
    const mails = await sql`select to_email from mkt.email_outbox where template = 'vendor_new_lead' and dedupe_key like ${'newlead:%'}`;
    expect(mails.map((m) => m.to_email)).toContain(owner.email);
    expect(mails.filter((m) => m.to_email === owner.email)).toHaveLength(1);
    const [farOwner] = await sql`select p.email from mkt.vendors v join mkt.profiles p on p.id = v.owner_profile_id where v.id = ${far.id}`;
    expect(mails.map((m) => m.to_email)).not.toContain(farOwner.email);
    await topup(sql, v.id, 1);
    const [need] = await sql`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    const { threadId } = await unlockNeed(sql, need.id, v.id, owner.id);
    await notifyMessage(sql, threadId, owner.id, 'Hello!');
    await notifyMessage(sql, threadId, owner.id, 'Are you there?');
    const msgs = await sql`select to_email from mkt.email_outbox where template = 'new_message'`;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].to_email).toBe(bride.email);
  });
});
