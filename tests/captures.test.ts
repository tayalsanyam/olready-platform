import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { closeCapture, convertCapture, listCaptures, openCaptureCount, saveCapture } from '@/lib/captures';
import { askVisitor, visitorAllowance } from '@/lib/brideAssistant';

const sql = testSql();
afterAll(() => sql.end());
afterEach(() => vi.unstubAllGlobals());
beforeAll(async () => {
  resetDb();
  await sql`insert into mkt.settings (key, value) values ('staff_alert_emails', ${sql.json(['team@olready.test'])}) on conflict (key) do update set value = excluded.value`;
  await sql`update mkt.settings set value = '0' where key in ('staff_quiet_from_hour', 'staff_quiet_to_hour')`;
});

describe('a visitor leaves a number', () => {
  it('reads the page she was on, joins repeats, alerts the team, and becomes a request', async () => {
    const ops = await profile(sql, 'ops', 'Ops');
    const owner = await profile(sql, 'vendor', 'Glow Studio');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Glow Studio');
    const mohali = await cityId(sql, 'mohali');

    await expect(saveCapture(sql, { phone: '12345', source: 'slip' })).rejects.toThrow(/valid mobile/);
    const first = await saveCapture(sql, { phone: '98765 40001', source: 'slip', page: '/vendors/mohali/photographers?sort=price', visitor: 'v1' });
    expect(first.repeat).toBe(false);
    // The same number again, this time after saving a vendor: one entry, richer.
    const again = await saveCapture(sql, { phone: '+91 9876540001', name: 'Simran', source: 'shortlist', page: `/v/${v.slug}`, slugs: [v.slug, 'not-a-vendor'], visitor: 'v1' });
    expect(again).toEqual({ id: first.id, repeat: true });
    const [row] = await listCaptures(sql);
    expect(row).toMatchObject({ phone: '+919876540001', name: 'Simran', source: 'slip', city: 'Mohali', category: 'Wedding photographer', vendor_slugs: [v.slug], page: `/v/${v.slug}` });
    expect(row.vendors).toEqual([{ slug: v.slug, name: 'Glow Studio' }]);
    expect(await openCaptureCount(sql)).toBe(1);
    const alerts = await sql<{ payload: { what: string } }[]>`select payload from mkt.email_outbox where to_email = 'team@olready.test'`;
    expect(alerts.map((a) => a.payload.what)).toEqual(['A visitor left a number to call']);

    // No page context: the town she picked in the header is used.
    await saveCapture(sql, { phone: '9876540002', source: 'exit', page: '/', townSlug: 'mohali', visitor: 'v2' });
    expect((await listCaptures(sql)).find((c) => c.phone === '+919876540002')).toMatchObject({ city_id: mohali, category: null });

    // After the call she wants makeup: the vendor she saved becomes her pick.
    const cats = await sql<{ id: number; slug: string }[]>`select id, slug from mkt.categories where slug in ('bridal-makeup', 'photographers')`;
    const makeup = cats.find((c) => c.slug === 'bridal-makeup')!.id;
    await expect(convertCapture(sql, first.id, { name: 'Simran Kaur', cityId: mohali, categoryIds: [] }, ops.id)).rejects.toThrow(/at least one service/);
    const lead = await convertCapture(sql, first.id, { name: 'Simran Kaur', cityId: mohali, categoryIds: [makeup] }, ops.id);
    const [l] = await sql<{ source: string; campaign: string; phone: string; status: string; picks: string[] }[]>`
      select l.source, l.campaign, l.phone, l.status, ln.preferred_vendor_ids as picks from mkt.leads l join mkt.lead_needs ln on ln.lead_id = l.id where l.id = ${lead.id}`;
    expect(l).toMatchObject({ source: 'website', campaign: 'Call-me card', phone: '+919876540001', status: 'new', picks: [v.id] });
    const second = (await listCaptures(sql))[0];
    await closeCapture(sql, second.id, 'No answer', ops.id);
    expect(await openCaptureCount(sql)).toBe(0);
    expect((await listCaptures(sql, 'done')).map((c) => c.status).sort()).toEqual(['closed', 'converted']);

    // One browser cannot flood the queue.
    for (let i = 0; i < 6; i++) await saveCapture(sql, { phone: `98765500${10 + i}`, source: 'dock', visitor: 'flood' });
    await expect(saveCapture(sql, { phone: '9876550099', source: 'dock', visitor: 'flood' })).rejects.toThrow(/already have your number/);
  });
});

describe('the chat helper for visitors', () => {
  it('answers two questions, then asks for her number, and keeps to its limits', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    await sql`update mkt.settings set value = '2' where key = 'visitor_ai_free'`;
    const bodies: { tools: { name: string }[]; system: { text: string }[]; messages: unknown[] }[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Try [Ghost Vendor](/v/ghost-vendor) or call 98765 43210.' }], stop_reason: 'end_turn' }), { status: 200 });
    });
    const a1 = await askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', text: 'Makeup artists in Chandigarh?' });
    // Read-only tools, visitor rules, and the same answer checks as the signed-in helper.
    expect(bodies[0].tools.map((t) => t.name).sort()).toEqual(['find_articles', 'find_ideas', 'price_guide', 'search_vendors', 'vendor_details']);
    expect(bodies[0].system[0].text).toMatch(/NOT signed in/);
    expect(a1.text).toBe('Try Ghost Vendor or call [number removed].');
    expect(a1.needPhone).toBe(false);
    const a2 = await askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', chatId: a1.chatId, text: 'And photographers?' });
    expect(a2.chatId).toBe(a1.chatId);
    expect(bodies[1].messages).toHaveLength(3); // her first question, the answer, the new question
    // Third question: number first, and the model is not called.
    const a3 = await askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', chatId: a1.chatId, text: 'Venues?' });
    expect(a3).toMatchObject({ needPhone: true, text: '' });
    expect(bodies).toHaveLength(2);
    await saveCapture(sql, { phone: '9876560001', source: 'chat', chatId: a1.chatId, visitor: 'chat-1' });
    const a4 = await askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', chatId: a1.chatId, text: 'Venues?' });
    expect(a4.needPhone).toBe(false);
    // The team sees what she asked next to her number.
    const row = (await listCaptures(sql)).find((c) => c.phone === '+919876560001')!;
    expect(row.chat!.filter((m) => m.role === 'user').map((m) => m.text)).toEqual(['Makeup artists in Chandigarh?', 'And photographers?', 'Venues?']);

    // Daily limit for one visitor, then for the whole site.
    await sql`update mkt.settings set value = '4' where key = 'visitor_ai_per_day'`;
    await askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', chatId: a1.chatId, text: 'One more?' });
    await expect(askVisitor(sql, { visitor: 'chat-1', ipKey: 'ip-1', chatId: a1.chatId, text: 'And another?' })).rejects.toThrow(/all the questions for today/);
    await sql`update mkt.settings set value = '4' where key = 'visitor_ai_site_day'`;
    expect((await visitorAllowance(sql, 'someone-new', 'ip-9')).left).toBe(0);
    await sql`update mkt.settings set value = '0' where key = 'visitor_ai_on'`;
    await expect(askVisitor(sql, { visitor: 'someone-new', ipKey: 'ip-9', text: 'Hello' })).rejects.toThrow(/resting/);
  });
});
