import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { createEnquiry } from '@/lib/leads';
import { createWedding } from '@/lib/weddings';
import { queueBrideCheckins, queueEventEve } from '@/lib/automations';
import { suppress, unsubscribeUrl, verifyUnsubscribe } from '@/lib/email';
import { POST as resendHook } from '@/app/api/resend/route';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

describe('automatic emails', () => {
  it('reminds the couple and each booked vendor the evening before, once', async () => {
    const bride = await profile(sql, 'bride', 'Mehak Arora');
    const w = await createWedding(sql, bride.id, { title: 'Mehak weds Rohan' });
    const owner = await profile(sql, 'vendor', 'Eve Decor');
    const v = await liveVendor(sql, owner.id, 'decorators', 'chandigarh', 'Eve Decor');
    await sql`update mkt.vendors set phone = '+919811100000' where id = ${v.id}`;
    const lead = await createEnquiry(sql, { brideProfileId: bride.id, weddingId: w.id, name: 'Mehak Arora', phone: '98999 00011', cityId: await cityId(sql, 'chandigarh'), needs: [{ categoryId: await categoryId(sql, 'decorators') }] });
    await sql`update mkt.leads set status = 'verified', verified_at = now() where id = ${lead.id}`;
    await sql`update mkt.lead_needs set status = 'closed_booked', booked_vendor_id = ${v.id} where lead_id = ${lead.id}`;
    await sql`insert into mkt.wedding_events (wedding_id, name, starts_at, venue) values
      (${w.id}, 'Sangeet', (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day 19 hours') at time zone 'Asia/Kolkata', 'Rosewood Banquets')`;
    expect(await queueEventEve(sql)).toBe(2);
    expect(await queueEventEve(sql)).toBe(2); // queued again, but deduplicated
    const mails = await sql<{ template: string; to_email: string; payload: Record<string, string> }[]>`
      select template, to_email, payload from mkt.email_outbox where template like 'event_eve%' order by template`;
    expect(mails).toHaveLength(2);
    expect(mails[0].payload.vendors).toContain('Eve Decor, +919811100000');
    expect(mails[0].payload.details).toMatch(/Sangeet: 7:00 pm, Rosewood Banquets/i);
    expect(mails[1]).toMatchObject({ template: 'event_eve_vendor' });
    expect(mails[1].payload.phone).toBe('+919899900011');
  });

  it('checks in at 7 days, and at 15 days only if nothing is booked and she has gone quiet', async () => {
    const mk = async (name: string, days: number, booked: boolean) => {
      const b = await profile(sql, 'bride', name);
      const l = await createEnquiry(sql, { brideProfileId: b.id, name, phone: '98111 0' + String(days).padStart(4, '0'), cityId: await cityId(sql, 'mohali'), needs: [{ categoryId: await categoryId(sql, 'photographers') }] });
      await sql`update mkt.leads set status = 'verified', verified_at = now() - make_interval(days => ${days}) where id = ${l.id}`;
      if (booked) await sql`update mkt.lead_needs set status = 'closed_booked' where lead_id = ${l.id}`;
      return b;
    };
    await mk('Seven Days', 7, false);
    await mk('Fifteen Open', 15, false);
    await mk('Fifteen Booked', 15, true);
    expect(await queueBrideCheckins(sql)).toEqual({ week: 1, quiet: 1 });
  });

  it('unsubscribe links are signed per address, and bounces or complaints stop email', async () => {
    const url = new URL(unsubscribeUrl('Asha@Example.com'));
    expect(verifyUnsubscribe(url.searchParams.get('e')!, url.searchParams.get('t')!)).toBe('asha@example.com');
    const other = new URL(unsubscribeUrl('someone@else.com'));
    expect(verifyUnsubscribe(url.searchParams.get('e')!, other.searchParams.get('t')!)).toBeNull();

    process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('test-secret-key').toString('base64');
    const send = async (body: object, sign = true) => {
      const raw = JSON.stringify(body);
      const id = 'msg_1', ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac('sha256', Buffer.from('test-secret-key')).update(`${id}.${ts}.${raw}`).digest('base64');
      return resendHook(new Request('http://x/api/resend', { method: 'POST', body: raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sign ? sig : 'bad'}` } }));
    };
    expect((await send({ type: 'email.bounced', data: { to: ['x@y.z'] } }, false)).status).toBe(401);
    await send({ type: 'email.bounced', data: { to: ['hard@bounce.in'], bounce: { type: 'Permanent', message: 'no such user' } } });
    await send({ type: 'email.complained', data: { to: ['spam@click.in'] } });
    for (let i = 0; i < 3; i++) await send({ type: 'email.bounced', data: { to: ['full@box.in'], bounce: { type: 'Transient' } } });
    await send({ type: 'email.bounced', data: { to: ['once@box.in'], bounce: { type: 'Transient' } } });
    const rows = await sql<{ email: string; reason: string }[]>`select email, reason from mkt.email_suppressions order by email`;
    expect(rows).toEqual([
      { email: 'full@box.in', reason: 'soft_bounce' },
      { email: 'hard@bounce.in', reason: 'hard_bounce' },
      { email: 'spam@click.in', reason: 'complaint' },
    ]);
    await suppress(sql, 'HARD@bounce.in', 'unsubscribed');
    expect((await sql`select reason from mkt.email_suppressions where email = 'hard@bounce.in'`)[0].reason).toBe('hard_bounce');
  });
});
