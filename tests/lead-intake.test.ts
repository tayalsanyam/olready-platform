import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cityId, profile, resetDb, testSql } from './helpers';
import { importLeads, matchCategories, parseLeadSheet, readDate, rowFromMetaFields, setLeadContact, sourceSummary } from '@/lib/leadIntake';
import { listCategories } from '@/lib/catalog';
import { threadsForBride } from '@/lib/threads';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const SHEET = [
  'id\tcreated_time\tcampaign_name\tfull_name\tphone_number\temail\tcity\twedding_date\twhat_do_you_need',
  'l:9001\t2026-11-01\tDiwali bridal\tSimran Kaur\tp:+919876500001\tsimran.ad@example.com\tMohali\t14/02/2027\tMakeup and photography',
  'l:9002\t2026-11-01\tDiwali bridal\tAman Gill\t9876500002\t\t160022\t\t',
  'l:9003\t2026-11-01\tDiwali bridal\t\t9876500003\t\tDelhi\t\tMakeup',
  'l:9004\t2026-11-01\tDiwali bridal\tBad Phone\t12345\t\tDelhi\t\tMakeup',
].join('\n');

describe('brides who answer an ad', () => {
  it('reads a pasted Meta sheet, dates and services', async () => {
    const rows = parseLeadSheet(SHEET);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ name: 'Simran Kaur', phone: '+919876500001', externalId: '9001', campaign: 'Diwali bridal', town: 'Mohali' });
    expect(parseLeadSheet('Name,Phone,City\n"Kaur, Simran",9876500009,"Mohali, Punjab"')[0]).toMatchObject({ name: 'Kaur, Simran', town: 'Mohali, Punjab' });
    expect(() => parseLeadSheet('email\nx@y.in')).toThrow(/name column/);
    expect(readDate('14/02/2027')).toBe('2027-02-14');
    expect(readDate('2027-02-14')).toBe('2027-02-14');
    expect(readDate('14 Feb 2027')).toBe('2027-02-14');
    expect(readDate('31/02/2027')).toBeNull();
    expect(readDate('soon')).toBeNull();
    const cats = await listCategories(sql, { activeOnly: true });
    const ids = matchCategories('Makeup and photography', cats);
    expect(cats.filter((c) => ids.includes(c.id)).map((c) => c.slug).sort()).toEqual(['bridal-makeup', 'photographers']);
    expect(matchCategories('', cats)).toEqual([]);
  });

  it('adds each row once, to the right town, waiting for its call', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const cats = await listCategories(sql, { activeOnly: true });
    const makeup = cats.find((c) => c.slug === 'bridal-makeup')!.id;
    const ops = await profile(sql, 'ops', 'Ops Person');
    const res = await importLeads(sql, parseLeadSheet(SHEET), { cityId: chd, categoryIds: [makeup], source: 'instagram' }, ops.id);
    expect(res).toMatchObject({ added: 2, merged: 0, skipped: 2 });
    expect(res.problems.join(' ')).toMatch(/Row 4/);
    expect(res.problems.join(' ')).toMatch(/Bad Phone/);
    const leads = await sql<{ bride_name: string; status: string; source: string; campaign: string; city: string; event: string | null; needs: number }[]>`
      select l.bride_name, l.status, l.source, l.campaign, c.slug as city, to_char(l.event_date, 'YYYY-MM-DD') as event,
        (select count(*) from mkt.lead_needs n where n.lead_id = l.id)::int as needs
      from mkt.leads l join mkt.cities c on c.id = l.city_id where l.external_id in ('9001', '9002') order by l.external_id`;
    expect(leads[0]).toMatchObject({ bride_name: 'Simran Kaur', status: 'new', source: 'instagram', campaign: 'Diwali bridal', city: 'mohali', event: '2027-02-14', needs: 2 });
    // No town or service on the form: the pincode finds the town and the default service is used.
    expect(leads[1]).toMatchObject({ city: 'chandigarh', needs: 1 });
    // Pasting the same sheet again adds nothing.
    const again = await importLeads(sql, parseLeadSheet(SHEET), { cityId: chd, categoryIds: [makeup], source: 'instagram' }, ops.id);
    expect(again.added).toBe(0);
    // The same phone answering another ad joins the request that is still waiting.
    const photo = cats.find((c) => c.slug === 'photographers')!.id;
    const more = await importLeads(sql, [{ name: 'Aman Gill', phone: '9876500002', categories: 'photographer', externalId: '9100' }], { cityId: chd, categoryIds: [makeup], source: 'instagram' }, ops.id);
    expect(more).toMatchObject({ added: 0, merged: 1 });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id where l.external_id = '9002' and ln.category_id = ${photo}`;
    expect(n).toBe(1);
    const summary = await sourceSummary(sql);
    expect(summary.find((s) => s.campaign === 'Diwali bridal')).toMatchObject({ source: 'instagram', leads: 2 });
  });

  it('takes her email on the call and puts the request in her account', async () => {
    const ops = await profile(sql, 'ops', 'Ops Two');
    const bride = await profile(sql, 'bride', 'Aman Gill');
    const [{ email }] = await sql<{ email: string }[]>`select email from mkt.profiles where id = ${bride.id}`;
    const [lead] = await sql<{ id: string }[]>`select id from mkt.leads where external_id = '9002'`;
    await expect(setLeadContact(sql, lead.id, { email: 'not-an-email' }, ops.id)).rejects.toThrow(/does not look right/);
    const { linked } = await setLeadContact(sql, lead.id, { email: email.toUpperCase(), name: 'Aman K Gill' }, ops.id);
    expect(linked).toBe(true);
    const [after] = await sql<{ bride_name: string; bride_profile_id: string }[]>`select bride_name, bride_profile_id from mkt.leads where id = ${lead.id}`;
    expect(after).toMatchObject({ bride_name: 'Aman K Gill', bride_profile_id: bride.id });
    expect(await threadsForBride(sql, bride.id)).toEqual([]);
    // An email with no account yet is simply stored; signing in with it later attaches the request.
    const [other] = await sql<{ id: string }[]>`select id from mkt.leads where external_id = '9001'`;
    expect((await setLeadContact(sql, other.id, { email: 'new.bride@example.com' }, ops.id)).linked).toBe(false);
  });

  it('maps a Meta lead form to the same shape', () => {
    const row = rowFromMetaFields(
      [{ name: 'full_name', values: ['Riya Sharma'] }, { name: 'phone_number', values: ['+919876500010'] }, { name: 'city', values: ['Gurgaon'] }, { name: 'what_do_you_need?', values: ['Venue'] }],
      { id: '777', campaign: 'Winter weddings' }
    );
    expect(row).toMatchObject({ name: 'Riya Sharma', phone: '+919876500010', town: 'Gurgaon', categories: 'Venue', externalId: '777', campaign: 'Winter weddings' });
  });
});

describe('what the verification call records', () => {
  it('saves her details, and shows a function in another town to vendors there', async () => {
    const { liveVendor } = await import('./helpers');
    const { createEnquiry, saveLeadDetails, setNeedBrief, visibleNeeds, advanceVerification } = await import('@/lib/leads');
    const { leadFunctions, opsSaveFunction, needFunctions, describeFunction } = await import('@/lib/functions');
    const ops = await profile(sql, 'ops', 'Ops Three');
    const chd = await cityId(sql, 'chandigarh');
    const delhi = await cityId(sql, 'delhi');
    const cats = await listCategories(sql, { activeOnly: true });
    const photo = cats.find((c) => c.slug === 'photographers')!.id;
    const delhiOwner = await profile(sql, 'vendor', 'Delhi Lens');
    const chdOwner = await profile(sql, 'vendor', 'Chd Lens');
    const inDelhi = await liveVendor(sql, delhiOwner.id, 'photographers', 'delhi', 'Delhi Lens');
    const inChd = await liveVendor(sql, chdOwner.id, 'photographers', 'chandigarh', 'Chd Lens');
    const lead = await createEnquiry(sql, { name: 'Kiran', phone: '9876511111', cityId: chd, source: 'instagram', needs: [{ categoryId: photo }], functions: [{ name: 'Wedding', date: '2027-03-01', guests: 300 }] });
    await saveLeadDetails(sql, lead.id, { name: 'Kiran Bedi', partnerName: 'Arjun', phone: '9876511111', altPhone: '98765 22222', bestTime: 'after 6 pm', whatsappOptIn: true, cityId: null, localityId: null, pincode: '160022', notes: 'Mother decides' }, ops.id);
    const [saved] = await sql<{ bride_name: string; partner_name: string; alt_phone: string; best_time: string; whatsapp_opt_in: boolean; pincode: string; city_id: number; notes: string }[]>`select * from mkt.leads where id = ${lead.id}`;
    expect(saved).toMatchObject({ bride_name: 'Kiran Bedi', partner_name: 'Arjun', alt_phone: '+919876522222', best_time: 'after 6 pm', whatsapp_opt_in: true, pincode: '160022', city_id: chd, notes: 'Mother decides' });
    await expect(saveLeadDetails(sql, lead.id, { name: 'Kiran', partnerName: '', phone: '123', altPhone: '', bestTime: '', whatsappOptIn: false, cityId: chd, localityId: null, pincode: null, notes: '' }, ops.id)).rejects.toThrow(/valid mobile/);

    const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
    await setNeedBrief(sql, need.id, 'Candid and  traditional, two days', ops.id);
    await expect(setNeedBrief(sql, need.id, 'call 98765 11111', ops.id)).rejects.toThrow(/phone numbers/);
    // A reception in Delhi, in the evening, for this photographer.
    await opsSaveFunction(sql, lead.id, { name: 'Reception', date: '2027-03-03', guests: 500, place: 'The Leela', cityId: delhi, time: 'evening', needIds: [need.id] }, ops.id);
    const fns = await leadFunctions(sql, lead.id);
    expect(fns.map((f) => [f.name, f.town, f.city ?? null, f.time_of_day ?? null])).toEqual([['Wedding', 'Chandigarh', null, null], ['Reception', 'Delhi', 'Delhi', 'evening']]);
    for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
    const seenInDelhi = await visibleNeeds(sql, inDelhi.id);
    const seenInChd = await visibleNeeds(sql, inChd.id);
    expect(seenInDelhi.map((n) => n.need_id)).toContain(need.id);
    expect(seenInChd.map((n) => n.need_id)).toContain(need.id);
    expect(seenInDelhi.find((n) => n.need_id === need.id)?.brief).toBe('Candid and traditional, two days');
    const shown = (await needFunctions(sql, [need.id])).get(need.id)!;
    expect(describeFunction(shown[1])).toBe('Reception, 3 Mar evening, 500 guests, at The Leela, in Delhi');
    // Move the reception back home: Delhi vendors no longer see it.
    await opsSaveFunction(sql, lead.id, { id: fns[1].id, name: 'Reception', date: '2027-03-03', guests: 500, cityId: chd, needIds: [need.id] }, ops.id);
    expect((await visibleNeeds(sql, inDelhi.id)).map((n) => n.need_id)).not.toContain(need.id);
  });
});
