import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { categoryId, cityId, liveVendor, profile, resetDb, testSql, topup } from './helpers';
import { financialYear, rupeesInWords, splitInclusive } from '@/lib/gst';
import { createOrder, markOrderPaid } from '@/lib/payments';
import { refundOrder } from '@/lib/refunds';
import { taxDocuments } from '@/lib/invoices';
import { invoicePdf } from '@/lib/invoicePdf';
import { flushWhatsApp, handleMetaWebhook, queueWhatsApp, verifyMetaSignature, waPhone } from '@/lib/whatsapp';
import { notifyQuote } from '@/lib/notify';
import { advanceVerification, createEnquiry, unlockNeed } from '@/lib/leads';
import { sendQuote } from '@/lib/threads';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual','test')`;
});
const ENV = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ENV };
});

const packId = async (code: string) => (await sql<{ id: number }[]>`select id from mkt.packs where code = ${code}`)[0].id;

describe('GST arithmetic', () => {
  it('splits a GST-inclusive price, intra-state and inter-state', () => {
    expect(splitInclusive(499900, 18, '04', '04')).toEqual({ taxable: 423644, cgst: 38128, sgst: 38128, igst: 0, utgst: true });
    expect(splitInclusive(499900, 18, '03', '03').utgst).toBe(false);
    expect(splitInclusive(499900, 18, '04', '03')).toEqual({ taxable: 423644, cgst: 0, sgst: 0, igst: 76256, utgst: false });
    const odd = splitInclusive(100, 18, '04', '04');
    expect(odd.taxable + odd.cgst + odd.sgst).toBe(100);
  });
  it('names financial years and writes amounts in words', () => {
    expect(financialYear(new Date('2026-03-31T17:00:00Z'))).toBe('25-26');
    expect(financialYear(new Date('2026-03-31T19:00:00Z'))).toBe('26-27'); // already 1 April in India
    expect(rupeesInWords(12050050)).toBe('Rupees One Lakh Twenty Thousand Five Hundred and Fifty Paise Only');
    expect(rupeesInWords(499900)).toBe('Rupees Four Thousand Nine Hundred Ninety Nine Only');
    expect(rupeesInWords(1234567800)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only');
  });
});

describe('tax invoices', () => {
  it('issues a numbered invoice on payment and a credit note per refund, with the right tax', async () => {
    process.env.SELLER_GSTIN = '04AAACK1234A1ZI';
    const admin = await profile(sql, 'admin');
    const a = await profile(sql, 'vendor', 'Tricity Lens');
    const va = await liveVendor(sql, a.id, 'photographers', 'mohali', 'Tricity Lens');
    const b = await profile(sql, 'vendor', 'City Decor');
    const vb = await liveVendor(sql, b.id, 'decorators', 'chandigarh', 'City Decor');

    const o1 = (await createOrder(sql, { profileId: a.id, vendorId: va.id, packId: await packId('topup-10'), gateway: 'manual' })).order;
    const o2 = (await createOrder(sql, { profileId: b.id, vendorId: vb.id, packId: await packId('topup-10'), gateway: 'manual' })).order;
    expect(await taxDocuments(sql, o1.id)).toHaveLength(0); // nothing before payment
    await markOrderPaid(sql, o1.id, 'pay1', admin.id);
    await markOrderPaid(sql, o2.id, 'pay2', admin.id);
    await markOrderPaid(sql, o1.id, 'pay1', admin.id); // a repeated webhook issues nothing new

    const [i1] = await taxDocuments(sql, o1.id);
    const [i2] = await taxDocuments(sql, o2.id);
    const fy = financialYear();
    expect(i1.number).toBe(`OLR/${fy}/00001`);
    expect(i2.number).toBe(`OLR/${fy}/00002`);
    // Mohali is in Punjab, so a Chandigarh seller charges IGST; a Chandigarh buyer pays CGST + UTGST.
    expect([Number(i1.igst_paise), Number(i1.cgst_paise), i1.buyer.state]).toEqual([76256, 0, 'Punjab']);
    expect([Number(i2.cgst_paise), Number(i2.sgst_paise), i2.utgst]).toEqual([38128, 38128, true]);
    expect(Number(i1.total_paise)).toBe(499900);

    await refundOrder(sql, o2.id, { amount: 1180, method: 'recorded', reference: 'NEFT1', reason: 'goodwill', takeBackCredits: false, endPlan: false, takeBackWallet: false }, admin.id);
    const docs = await taxDocuments(sql, o2.id);
    const cn = docs.find((d) => d.kind === 'credit_note')!;
    expect(cn.number).toBe(`OLR-CN/${fy}/00001`);
    expect(cn.original_number).toBe(i2.number);
    expect([Number(cn.taxable_paise), Number(cn.cgst_paise), Number(cn.sgst_paise)]).toEqual([100000, 9000, 9000]);

    // A GSTIN saved later changes future invoices only.
    await sql`update mkt.vendors set gstin = '04AABCT1332L1ZM', legal_name = 'City Decor LLP' where id = ${vb.id}`;
    expect((await taxDocuments(sql, o2.id))[0].buyer.gstin).toBeNull();

    const pdf = await invoicePdf(cn);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    const pdf2 = await invoicePdf(i1);
    expect(pdf2.length).toBeGreaterThan(2000);
  });

  it('lets a plan activate with the Olready invoice when no link is given', async () => {
    const admin = await profile(sql, 'admin');
    const o = await profile(sql, 'vendor', 'Plan Studio');
    const v = await liveVendor(sql, o.id, 'photographers', 'chandigarh', 'Plan Studio');
    const { order } = await createOrder(sql, { profileId: o.id, vendorId: v.id, packId: await packId('pro'), gateway: 'manual' });
    await markOrderPaid(sql, order.id, 'p', admin.id);
    const [sub] = await sql<{ id: string }[]>`select id from mkt.vendor_subscriptions where order_id = ${order.id}`;
    const { activateSubscription } = await import('@/lib/payments');
    await expect(activateSubscription(sql, sub.id, '', '', admin.id)).rejects.toThrow(/signed contract/);
    await activateSubscription(sql, sub.id, '', 'https://drive/contract', admin.id);
    const [s] = await sql<{ invoice_url: string; status: string }[]>`select invoice_url, status from mkt.vendor_subscriptions where id = ${sub.id}`;
    expect(s.status).toBe('active');
    expect(s.invoice_url).toMatch(/^\/invoices\/[0-9a-f-]{36}$/);
  });
});

describe('WhatsApp', () => {
  const onMeta = () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_TOKEN = 't';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
  };

  it('normalises Indian mobiles only', () => {
    expect(waPhone('98000 11122')).toBe('919800011122');
    expect(waPhone('+91-98000-11122')).toBe('919800011122');
    expect(waPhone('09800011122')).toBe('919800011122');
    expect(waPhone('0172 2700000')).toBeNull();
    expect(waPhone('12345')).toBeNull();
  });

  it('sends nothing until the channel and the template are both on, and never to a STOP number', async () => {
    expect(await queueWhatsApp(sql, '9800011122', 'quote_received', ['a'], 'k1')).toBe(false); // no provider
    onMeta();
    expect(await queueWhatsApp(sql, '9800011122', 'quote_received', ['a'], 'k1')).toBe(false); // template off
    await sql`update mkt.whatsapp_templates set template_name = 'quote_received_v1', enabled = true where event = 'quote_received'`;
    expect(await queueWhatsApp(sql, '9800011122', 'quote_received', ['Simran', 'Glow', '₹45,000', 'https://x'], 'k1')).toBe(true);
    expect(await queueWhatsApp(sql, '9800011122', 'quote_received', ['again'], 'k1')).toBe(false); // deduped

    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));
    expect(await flushWhatsApp(sql)).toEqual({ sent: 1, failed: 0 });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('https://graph.facebook.com/v21.0/123/messages');
    const body = JSON.parse(String(init!.body));
    expect(body.to).toBe('919800011122');
    expect(body.template.name).toBe('quote_received_v1');
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Simran', 'Glow', '₹45,000', 'https://x']);

    // Delivery receipt, then STOP.
    await handleMetaWebhook(sql, { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read' }] } }] }] });
    expect((await sql`select status from mkt.whatsapp_outbox where provider_message_id = 'wamid.1'`)[0].status).toBe('read');
    await handleMetaWebhook(sql, { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] });
    expect((await sql`select status from mkt.whatsapp_outbox where provider_message_id = 'wamid.1'`)[0].status).toBe('read'); // never goes backwards
    await handleMetaWebhook(sql, { entry: [{ changes: [{ value: { messages: [{ from: '919800011122', type: 'text', text: { body: 'STOP' } }] } }] }] });
    expect(await queueWhatsApp(sql, '9800011122', 'quote_received', ['a'], 'k2')).toBe(false);
  });

  it('only messages brides who opted in on their request', async () => {
    onMeta();
    await sql`update mkt.whatsapp_templates set template_name = 'quote_received_v1', enabled = true where event = 'quote_received'`;
    const ops = await profile(sql, 'ops');
    const o = await profile(sql, 'vendor', 'Wa Lens');
    const v = await liveVendor(sql, o.id, 'photographers', 'chandigarh', 'Wa Lens');
    await topup(sql, v.id, 20);
    const mk = async (name: string, phone: string, optIn: boolean) => {
      const bride = await profile(sql, 'bride', name);
      const lead = await createEnquiry(sql, {
        brideProfileId: bride.id,
        name,
        phone,
        cityId: await cityId(sql, 'chandigarh'),
        whatsappOptIn: optIn,
        needs: [{ categoryId: await categoryId(sql, 'photographers'), budgetInr: 100000 }],
      });
      for (const s of [1, 2, 3] as const) await advanceVerification(sql, lead.id, s, ops.id);
      const [need] = await sql<{ id: string }[]>`select id from mkt.lead_needs where lead_id = ${lead.id}`;
      await unlockNeed(sql, need.id, v.id, o.id);
      const [t] = await sql<{ id: string }[]>`select id from mkt.threads where lead_need_id = ${need.id}`;
      return sendQuote(sql, t.id, o, 60000, 'Full day');
    };
    const yes = await mk('Opted In', '97000 11111', true);
    const no = await mk('Not Asked', '97000 22222', false);
    await notifyQuote(sql, yes.id, 'sent');
    await notifyQuote(sql, no.id, 'sent');
    const rows = await sql<{ to_phone: string }[]>`select to_phone from mkt.whatsapp_outbox where event = 'quote_received' and to_phone like '9197000%'`;
    expect(rows.map((r) => r.to_phone)).toEqual(['919700011111']);
  });

  it('checks the Meta webhook signature', () => {
    process.env.WHATSAPP_APP_SECRET = 's3cret';
    const raw = '{"entry":[]}';
    const sig = 'sha256=' + createHmac('sha256', 's3cret').update(raw).digest('hex');
    expect(verifyMetaSignature(raw, sig)).toBe(true);
    expect(verifyMetaSignature(raw + ' ', sig)).toBe(false);
    expect(verifyMetaSignature(raw, null)).toBe(false);
  });
});
