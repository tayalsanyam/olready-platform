import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { searchArticles, searchPages, searchVendors } from '@/lib/search';
import { saveArticle, setArticleStatus, articleBySlug, subscribeNewsletter, unsubscribeNewsletter } from '@/lib/articles';
import { removeWallItem, setWallNote, toggleSaved, wallItems } from '@/lib/ideas';
import { inviteBySlug, inviteDesigns, saveWeddingInvite } from '@/lib/invites';
import { addEvent, createWedding, joinWedding } from '@/lib/weddings';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

describe('search', () => {
  it('finds vendors by name in the chosen city, escapes wildcards, and maps words to category pages', async () => {
    const o1 = await profile(sql, 'vendor', 'A');
    const o2 = await profile(sql, 'vendor', 'B');
    const chd = await liveVendor(sql, o1.id, 'venues', 'chandigarh', 'Lotus Banquet');
    await sql`update mkt.vendors set service_city_ids = ${[await cityId(sql, 'chandigarh')]} where id = ${chd.id}`;
    await liveVendor(sql, o2.id, 'venues', 'panchkula', 'Lotus Lawns');
    const all = await searchVendors(sql, 'lotus', null);
    expect(all.map((v) => v.business_name).sort()).toEqual(['Lotus Banquet', 'Lotus Lawns']);
    const pkl = await searchVendors(sql, 'lotus', await cityId(sql, 'panchkula'));
    expect(pkl.map((v) => v.business_name)).toEqual(['Lotus Lawns']);
    expect(await searchVendors(sql, '%', null)).toEqual([]);
    expect(await searchVendors(sql, 'x', null)).toEqual([]);
    const pages = await searchPages(sql, 'banquet', { slug: 'mohali', name: 'Mohali' });
    expect(pages.some((p) => p.href === '/vendors/mohali/venues/banquet-halls')).toBe(true);
  });
});

describe('articles', () => {
  it('drafts stay hidden, publishing needs a summary and real text, slugs are unique', async () => {
    const editor = await profile(sql, 'content', 'Meera');
    const id = await saveArticle(sql, null, { title: 'Choosing a decorator', excerpt: '', body: 'Too short', section: 'vendors', categoryId: null, cityId: null, authorName: '' }, editor.id);
    expect(await articleBySlug(sql, 'choosing-a-decorator')).toBeNull();
    expect((await articleBySlug(sql, 'choosing-a-decorator', { includeDrafts: true }))?.author_name).toBe('Olready team');
    await expect(setArticleStatus(sql, id, 'published', editor.id)).rejects.toThrow(/few paragraphs/);
    await saveArticle(sql, id, { title: 'Choosing a decorator', excerpt: 'What to ask', body: 'Decor words. '.repeat(40), section: 'vendors', categoryId: null, cityId: null, authorName: 'Meera' }, editor.id);
    await setArticleStatus(sql, id, 'published', editor.id);
    expect((await articleBySlug(sql, 'choosing-a-decorator'))?.status).toBe('published');
    await expect(
      saveArticle(sql, null, { title: 'Choosing a decorator', excerpt: '', body: '', section: 'vendors', categoryId: null, cityId: null, authorName: '' }, editor.id)
    ).rejects.toThrow(/already uses/);
    expect((await searchArticles(sql, 'decorator')).map((a) => a.slug)).toContain('choosing-a-decorator');
  });

  it('newsletter sign-up is idempotent and unsubscribes by token', async () => {
    await subscribeNewsletter(sql, 'Fan@Example.com');
    await subscribeNewsletter(sql, 'fan@example.com');
    const [s] = await sql`select unsubscribe_token from mkt.newsletter_subscribers where email = 'fan@example.com'`;
    const [{ n }] = await sql`select count(*)::int as n from mkt.email_outbox where template = 'newsletter_welcome' and to_email = 'fan@example.com'`;
    expect(n).toBe(1);
    expect(await unsubscribeNewsletter(sql, s.unsubscribe_token)).toBe(true);
    await expect(subscribeNewsletter(sql, 'nope')).rejects.toThrow(/valid email/);
  });
});

describe('wedding wall and invites', () => {
  it('family members share the wall and notes; invites carry names and functions', async () => {
    const bride = await profile(sql, 'bride', 'Ira');
    const mum = await profile(sql, 'bride', 'Ira Mum');
    const w = await createWedding(sql, bride.id, { title: 'Ira weds Dev', weddingDate: '2027-01-20' });
    const [{ join_code }] = await sql`select join_code from mkt.weddings where id = ${w.id}`;
    await joinWedding(sql, join_code, mum.id, 'family');
    const editor = await profile(sql, 'content', 'Ed');
    const art = await saveArticle(sql, null, { title: 'Sangeet playlist ideas', excerpt: 'Songs', body: 'Music. '.repeat(60), section: 'ideas', categoryId: null, cityId: null, authorName: 'Ed' }, editor.id);
    await setArticleStatus(sql, art, 'published', editor.id);
    await toggleSaved(sql, w.id, 'article', art, mum.id);
    let items = await wallItems(sql, w.id);
    expect(items).toHaveLength(1);
    expect(items[0].saved_by_name).toBe('Ira Mum');
    await setWallNote(sql, w.id, items[0].id, 'Use for sangeet');
    items = await wallItems(sql, w.id);
    expect(items[0].note).toBe('Use for sangeet');
    const other = await createWedding(sql, (await profile(sql, 'bride', 'Other')).id, { title: 'Other' });
    await expect(setWallNote(sql, other.id, items[0].id, 'x')).rejects.toThrow(/not found/);
    await removeWallItem(sql, w.id, items[0].id);
    expect(await wallItems(sql, w.id)).toHaveLength(0);

    const designs = await inviteDesigns(sql, { kind: 'card', culture: 'sikh' });
    expect(designs[0].culture).toBe('sikh');
    await addEvent(sql, w.id, bride.id, 'Anand Karaj', '2027-01-20T10:00:00+05:30', 'Gurdwara, Sector 34');
    await expect(saveWeddingInvite(sql, w.id, bride.id, { kind: 'card', templateCode: designs[0].code, opening: '', bride: 'Ira', groom: '', family: '', message: '', publish: true })).rejects.toThrow(/both names/);
    const slug = await saveWeddingInvite(sql, w.id, bride.id, { kind: 'card', templateCode: designs[0].code, opening: 'ੴ', bride: 'Ira', groom: 'Dev', family: '', message: 'Join us', publish: true });
    const again = await saveWeddingInvite(sql, w.id, mum.id, { kind: 'card', templateCode: designs[1].code, opening: 'ੴ', bride: 'Ira', groom: 'Dev', family: 'Daughter of …', message: 'Join us', publish: true });
    expect(again).toBe(slug);
    const pub = await inviteBySlug(sql, slug);
    expect(pub?.content.family).toBe('Daughter of …');
    expect(pub?.content.events.map((e) => e.name)).toContain('Anand Karaj');
    expect(pub?.content.dateLine).toMatch(/20 January 2027/);
    await saveWeddingInvite(sql, w.id, bride.id, { kind: 'card', templateCode: designs[1].code, opening: '', bride: 'Ira', groom: 'Dev', family: '', message: '', publish: false });
    expect(await inviteBySlug(sql, slug)).toBeNull();
  });
});
