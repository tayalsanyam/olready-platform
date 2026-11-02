import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { advanceVerification, createEnquiry, unlockNeed } from '@/lib/leads';
import { markOrderPaid } from '@/lib/payments';
import { approveEngagement, buyRm, currentEngagement, endExpiredEngagements, engagementFromPerk, rejectEngagement } from '@/lib/rm';
import { threadAccess } from '@/lib/threads';
import { createWedding } from '@/lib/weddings';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual','test')`;
});

describe('relationship managers', () => {
  it('bride pays first, then the team assigns an RM until the wedding at the latest', async () => {
    const bride = await profile(sql, 'bride', 'Kavya');
    const rm = await profile(sql, 'rm', 'Tanya RM');
    const ops = await profile(sql, 'ops');
    const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    const w = await createWedding(sql, bride.id, { weddingDate: soon, cityId: await cityId(sql, 'chandigarh') });
    const order = await buyRm(sql, { profileId: bride.id, weddingId: w.id, gateway: 'manual' });
    await expect(buyRm(sql, { profileId: bride.id, weddingId: w.id, gateway: 'manual' })).rejects.toThrow(/already/);
    let e = (await currentEngagement(sql, bride.id))!;
    expect(e.status).toBe('pending_payment');
    await expect(approveEngagement(sql, e.id, rm.id, ops.id)).rejects.toThrow(/not waiting/);
    await markOrderPaid(sql, order.id, 'bank-1', ops.id);
    e = (await currentEngagement(sql, bride.id))!;
    expect(e.status).toBe('pending_approval');
    const vendorOwner = await profile(sql, 'vendor');
    await expect(approveEngagement(sql, e.id, vendorOwner.id, ops.id)).rejects.toThrow(/RM role/);
    await approveEngagement(sql, e.id, rm.id, ops.id);
    e = (await currentEngagement(sql, bride.id))!;
    expect(e.status).toBe('active');
    const days = (e.ends_at!.getTime() - e.starts_at!.getTime()) / 864e5;
    expect(days).toBeLessThan(12); // wedding in 10 days beats the 30-day length
  });

  it('a booking perk skips payment and can be declined with a reason', async () => {
    const bride = await profile(sql, 'bride');
    const ops = await profile(sql, 'ops');
    const [perk] = await sql`insert into mkt.bride_perks (profile_id, perk, claim_by) values (${bride.id}, 'rm_access_7d', now() + interval '60 days') returning id`;
    await engagementFromPerk(sql, bride.id, perk.id, null, 7);
    const e = (await currentEngagement(sql, bride.id))!;
    expect(e).toMatchObject({ status: 'pending_approval', source: 'perk', length_days: 7 });
    await expect(rejectEngagement(sql, e.id, '', ops.id)).rejects.toThrow(/Write why/);
    await rejectEngagement(sql, e.id, 'Outside service area', ops.id);
    expect(await currentEngagement(sql, bride.id)).toBeNull();
  });

  it('an RM reads a bride’s conversations only while assigned, and engagements end on time', async () => {
    const ops = await profile(sql, 'ops');
    const rm = await profile(sql, 'rm');
    const otherRm = await profile(sql, 'rm');
    const bride = await profile(sql, 'bride');
    const lead = await createEnquiry(sql, {
      brideProfileId: bride.id, name: 'Isha', phone: '9800011122', cityId: await cityId(sql, 'chandigarh'),
      needs: [{ categoryId: await categoryId(sql, 'bridal-makeup') }],
    });
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const owner = await profile(sql, 'vendor');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup');
    await topup(sql, v.id, 1);
    const [need] = await sql`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    const { threadId } = await unlockNeed(sql, need.id, v.id, owner.id);
    await expect(threadAccess(sql, threadId, rm)).rejects.toThrow(/cannot open/);
    const [perk] = await sql`insert into mkt.bride_perks (profile_id, perk, claim_by) values (${bride.id}, 'rm_access_7d', now() + interval '60 days') returning id`;
    await engagementFromPerk(sql, bride.id, perk.id, null, 7);
    const e = (await currentEngagement(sql, bride.id))!;
    await approveEngagement(sql, e.id, rm.id, ops.id);
    expect((await threadAccess(sql, threadId, rm)).side).toBe('staff');
    await expect(threadAccess(sql, threadId, otherRm)).rejects.toThrow(/cannot open/);
    await sql`update mkt.rm_engagements set ends_at = now() - interval '1 minute' where id = ${e.id}`;
    expect(await endExpiredEngagements(sql)).toBeGreaterThanOrEqual(1);
    await expect(threadAccess(sql, threadId, rm)).rejects.toThrow(/cannot open/);
  });
});
