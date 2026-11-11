import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { categoryId, liveVendor, profile, resetDb, testSql } from './helpers';
import { ask, checkAnswer, decideAction, purgeOldChats, rateMessage, runTool, shownMessages, TOOLS } from '@/lib/brideAssistant';
import { createWedding, shortlist } from '@/lib/weddings';
import { budgetSummary } from '@/lib/budget';

const sql = testSql();
afterAll(() => sql.end());
let venueSlug = '';
let muaSlug = '';
beforeAll(async () => {
  resetDb();
  const o1 = await profile(sql, 'vendor', 'Hall Owner');
  const v1 = await liveVendor(sql, o1.id, 'venues', 'zirakpur', 'Royal Greens');
  await sql`update mkt.vendors set starting_price_inr = 1400, attributes = '{"capacity_max": 800}', phone = '9876543210', email = 'owner@royal.in' where id = ${v1.id}`;
  const o2 = await profile(sql, 'vendor', 'Small Hall');
  const v2 = await liveVendor(sql, o2.id, 'venues', 'zirakpur', 'Tiny Terrace');
  await sql`update mkt.vendors set starting_price_inr = 900, attributes = '{"capacity_max": 150}' where id = ${v2.id}`;
  const o3 = await profile(sql, 'vendor', 'Mua');
  const v3 = await liveVendor(sql, o3.id, 'bridal-makeup', 'chandigarh', 'Glow Studio');
  await sql`update mkt.vendors set starting_price_inr = 25000, tagline = 'Airbrush HD bridal looks' where id = ${v3.id}`;
  venueSlug = v1.slug;
  muaSlug = v3.slug;
  process.env.ANTHROPIC_API_KEY = 'test';
});
afterEach(() => vi.restoreAllMocks());

/** Scripts Claude's replies in order; returns the fetch spy so tests can read what was sent. */
function claude(...replies: ({ text: string } | { tool: string; input: Record<string, unknown> })[]) {
  const spy = vi.spyOn(globalThis, 'fetch');
  replies.forEach((r, i) =>
    spy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          stop_reason: 'tool' in r ? 'tool_use' : 'end_turn',
          content: 'tool' in r ? [{ type: 'tool_use', id: `t${i}`, name: r.tool, input: r.input }] : [{ type: 'text', text: r.text }],
        }),
        { status: 200 }
      )
    )
  );
  return spy;
}

describe('Ask Olready tools', () => {
  it('finds vendors by guests, price and keyword, never with contact details', async () => {
    const bride = await profile(sql, 'bride', 'Simran Kaur');
    const ctx = { db: sql, profile: bride, wedding: null, threadId: '', slugs: new Set<string>(), actions: [] as string[] };
    const r = (await runTool(ctx, 'search_vendors', { category: 'venues', city: 'zirakpur', guests: 400 })) as { vendors: { slug: string; starting_price: string }[] };
    expect(r.vendors.map((v) => v.slug)).toEqual([venueSlug]);
    expect(JSON.stringify(r)).not.toMatch(/9876543210|owner@royal/);
    expect(ctx.slugs.has(venueSlug)).toBe(true);
    const kw = (await runTool(ctx, 'search_vendors', { category: 'bridal-makeup', keyword: 'airbrush' })) as { vendors: { slug: string }[] };
    expect(kw.vendors.map((v) => v.slug)).toEqual([muaSlug]);
    const cheap = (await runTool(ctx, 'search_vendors', { category: 'venues', max_price: 1000 })) as { vendors: { name: string }[] };
    expect(cheap.vendors.map((v) => v.name)).toEqual(['Tiny Terrace']);
    const details = await runTool(ctx, 'vendor_details', { slug: venueSlug });
    expect(JSON.stringify(details)).not.toMatch(/9876543210|owner@royal/);
    expect(await runTool(ctx, 'search_vendors', { category: 'astrologers' })).toHaveProperty('error');
    const req = (await runTool(ctx, 'draft_request', { categories: ['venues', 'caterers'], city: 'zirakpur', guests: 400 })) as { link: string };
    expect(req.link).toBe('/enquire?category=venues%2Ccaterers&city=zirakpur&guests=400');
  });

  it('every tool has a schema the API accepts', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(20);
    }
  });
});

describe('answer checks', () => {
  it('removes vendor links that did not come from a lookup, and any contact details', async () => {
    const r = await checkAnswer(
      sql,
      `Try [Royal Greens](/v/${venueSlug}) or [Made Up Hall](/v/made-up-hall). Call 98765 43210 or mail a@b.in`,
      new Set([venueSlug]),
      true
    );
    expect(r.text).toContain(`[Royal Greens](/v/${venueSlug})`);
    expect(r.text).toContain('Made Up Hall');
    expect(r.text).not.toContain('/v/made-up-hall');
    expect(r.text).not.toMatch(/98765 43210|a@b\.in/);
    expect(r.flags.sort()).toEqual(['contact', 'unknown_vendor']);
    // A real vendor that was never looked up in this chat is still removed.
    const r2 = await checkAnswer(sql, `[Glow](/v/${muaSlug})`, new Set(), true);
    expect(r2.flags).toEqual(['unknown_vendor']);
    expect((await checkAnswer(sql, 'Venues cost about ₹1,500 a plate.', new Set(), false)).flags).toEqual(['unsourced_price']);
    expect((await checkAnswer(sql, 'Book the venue 9 to 12 months ahead.', new Set(), false)).flags).toEqual([]);
  });
});

describe('a conversation', () => {
  it('runs the tool loop, stores everything, and only changes the plan when she confirms', async () => {
    const bride = await profile(sql, 'bride', 'Ira Mehta');
    const w = await createWedding(sql, bride.id, { title: 'Ira weds Dev', weddingDate: '2027-02-14' });
    const spy = claude(
      { tool: 'search_vendors', input: { category: 'venues', city: 'zirakpur', guests: 400 } },
      { tool: 'propose_shortlist', input: { slug: venueSlug } },
      { text: `[Royal Greens](/v/${venueSlug}) holds 800 and starts at ₹1,400 a plate. I've put a card below to shortlist it.` }
    );
    const events: string[] = [];
    const r = await ask(sql, bride, { text: 'Venue in Zirakpur for 400 guests?' }, (e) => events.push(e.type === 'status' ? e.text : e.type));
    expect(spy).toHaveBeenCalledTimes(3);
    expect(events).toEqual(['thread', 'Looking through vendors', 'Preparing a shortlist card']);
    expect(r.flags).toEqual([]);
    expect(r.actions).toHaveLength(1);
    // The second call carried the tool result back to Claude.
    const second = JSON.parse(String(spy.mock.calls[1][1]!.body));
    expect(second.messages.at(-1).content[0].type).toBe('tool_result');
    expect(second.system[0].text).toMatch(/venues: Wedding venues/);
    expect(JSON.stringify(second)).not.toMatch(/9876543210/);

    expect(await shortlist(sql, w.id)).toHaveLength(0); // nothing yet
    const other = await profile(sql, 'bride', 'Someone Else');
    await expect(decideAction(sql, r.actions[0].id, other, true)).rejects.toThrow(/not yours/);
    expect(await decideAction(sql, r.actions[0].id, bride, true)).toBe('done');
    expect((await shortlist(sql, w.id)).map((s) => s.slug)).toEqual([venueSlug]);
    expect(await decideAction(sql, r.actions[0].id, bride, true)).toBe('done'); // tapping twice changes nothing

    // Shown history: her question and the answer, with the card.
    const shown = await shownMessages(sql, r.threadId);
    expect(shown.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(shown[1].actions[0].status).toBe('done');
    await rateMessage(sql, shown[1].id, bride.id, true);
    await expect(rateMessage(sql, shown[1].id, other.id, true)).rejects.toThrow();

    // A follow-up in the same chat sends the earlier turn too, so she can say "that one".
    const spy2 = claude(
      { tool: 'propose_category_budget', input: { category: 'venues', amount: 600000 } },
      { text: 'Done, tap Confirm to set it.' }
    );
    const r2 = await ask(sql, bride, { threadId: r.threadId, text: 'Set my venue budget to 6 lakh' });
    const body = JSON.parse(String(spy2.mock.calls[0][1]!.body));
    expect(body.messages[0].content).toBe('Venue in Zirakpur for 400 guests?');
    await decideAction(sql, r2.actions[0].id, bride, true);
    const b = await budgetSummary(sql, w.id);
    expect(b.lines.find((l) => l.category_id === 0 || l.planned === 600000)?.planned).toBe(600000);
  });

  it('catches an invented vendor in a real answer and stores the flag', async () => {
    const bride = await profile(sql, 'bride', 'Noor');
    claude({ text: 'Try [Shaadi Palace](/v/shaadi-palace), call them on 9812345678.' });
    const r = await ask(sql, bride, { text: 'best venue?' });
    expect(r.text).toBe('Try Shaadi Palace, call them on [number removed].');
    expect(r.flags.sort()).toEqual(['contact', 'unknown_vendor']);
  });

  it('respects limits, the off switch, roles and other brides’ chats', async () => {
    const bride = await profile(sql, 'bride', 'Limit Test');
    await sql`update mkt.settings set value = '1' where key = 'bride_assistant_per_day'`;
    claude({ text: 'Hello!' });
    const r = await ask(sql, bride, { text: 'hi' });
    await expect(ask(sql, bride, { text: 'again' })).rejects.toThrow(/today's 1 questions/);
    await sql`update mkt.settings set value = '40' where key = 'bride_assistant_per_day'`;

    // Another bride cannot continue this chat: hers starts a new one.
    const other = await profile(sql, 'bride', 'Other');
    claude({ text: 'Hi Other' });
    const r2 = await ask(sql, other, { threadId: r.threadId, text: 'hi' });
    expect(r2.threadId).not.toBe(r.threadId);

    const vendor = await profile(sql, 'vendor', 'V');
    await expect(ask(sql, vendor, { text: 'hi' })).rejects.toThrow(/brides/);
    await sql`update mkt.settings set value = '0' where key = 'bride_assistant_on'`;
    await expect(ask(sql, other, { text: 'hi' })).rejects.toThrow(/resting/);
    await sql`update mkt.settings set value = '1' where key = 'bride_assistant_on'`;
  });

  it('deletes chats unused for the keep period', async () => {
    await sql`update mkt.assistant_threads set updated_at = now() - interval '100 days' where title = 'hi'`;
    expect(await purgeOldChats(sql)).toBeGreaterThan(0);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from mkt.assistant_threads where title = 'hi'`;
    expect(n).toBe(0);
  });
});

// Keep categoryId import used for clarity of fixtures elsewhere.
void categoryId;
