import type { Db } from './db';
import { DomainError, audit } from './db';
import { OPERATOR } from './legal';
import { financialYear, gstinState, splitInclusive, stateCode, STATE_CODES } from './gst';

// Olready issues its own GST tax invoices when an order is paid, and a credit note for each
// refund. Numbers run without gaps per financial year; every figure is frozen at issue.

export type Party = { name: string; address: string; gstin: string | null; state: string; state_code: string };
export type TaxDocument = {
  id: string;
  kind: 'invoice' | 'credit_note';
  number: string;
  fy: string;
  order_id: string;
  refund_id: string | null;
  original_id: string | null;
  original_number: string | null;
  issued_at: Date;
  seller: Party;
  buyer: Party;
  place_of_supply: string;
  description: string;
  sac: string;
  list_paise: string;
  discount_paise: string;
  taxable_paise: string;
  cgst_paise: string;
  sgst_paise: string;
  igst_paise: string;
  total_paise: string;
  rate_pct: string;
  utgst: boolean;
};

export const GST_RATE = 18;

export function seller(): Party {
  const gstin = (process.env.SELLER_GSTIN ?? OPERATOR.gstin).trim().toUpperCase() || null;
  const code = gstinState(gstin) ?? stateCode(process.env.SELLER_STATE ?? 'Chandigarh') ?? '04';
  return {
    name: process.env.SELLER_NAME ?? 'Katalyst Infomedia',
    address: process.env.SELLER_ADDRESS ?? OPERATOR.address,
    gstin,
    state: STATE_CODES[code],
    state_code: code,
  };
}

const prefix = (kind: 'invoice' | 'credit_note') => (kind === 'invoice' ? process.env.INVOICE_PREFIX ?? 'OLR' : `${process.env.INVOICE_PREFIX ?? 'OLR'}-CN`);

async function nextNumber(db: Db, kind: 'invoice' | 'credit_note', fy: string) {
  const [c] = await db<{ last: number }[]>`
    insert into mkt.invoice_counters (kind, fy, last) values (${kind}, ${fy}, 1)
    on conflict (kind, fy) do update set last = mkt.invoice_counters.last + 1 returning last`;
  return { seq: c.last, number: `${prefix(kind)}/${fy}/${String(c.last).padStart(5, '0')}` };
}

/** The tax invoice for a paid order: returns the existing one, or issues it. Call inside a transaction. */
export async function ensureInvoice(db: Db, orderId: string, actor: string | null = null) {
  const [have] = await db<{ id: string }[]>`select id from mkt.tax_documents where order_id = ${orderId} and kind = 'invoice'`;
  if (have) return have.id;
  const [o] = await db<{
    status: string; amount_inr: number; list_price_inr: number | null; discount_inr: number; buyer_gstin: string | null; paid_at: Date | null;
    product: string; kind: string; vendor_id: string | null; buyer_name: string; vendor_address: string | null; city_state: string | null; city: string | null;
    city_state_code: string | null; billing_state_code: string | null; billing_pincode: string | null;
  }[]>`
    select o.status, o.amount_inr, o.list_price_inr, o.discount_inr, coalesce(o.buyer_gstin, v.gstin) as buyer_gstin, o.paid_at,
      coalesce('Olready ' || p.name, s.name, case when o.wallet_topup_inr is not null then 'Olready ads wallet top-up' end, 'Olready service') as product,
      case when p.id is not null then 'pack' when o.service_code is not null then 'service' else 'wallet' end as kind,
      o.vendor_id, coalesce(v.legal_name, v.business_name, pr.full_name) as buyer_name, v.billing_address as vendor_address,
      ci.state as city_state, ci.state_code as city_state_code, v.billing_state_code, v.billing_pincode, ci.name as city
    from mkt.orders o
    join mkt.profiles pr on pr.id = o.profile_id
    left join mkt.packs p on p.id = o.pack_id
    left join mkt.services s on s.code = o.service_code
    left join mkt.vendors v on v.id = o.vendor_id
    left join mkt.cities ci on ci.id = v.city_id
    where o.id = ${orderId} for update of o`;
  if (!o) throw new DomainError('not_found', 'Order not found');
  if (!['paid', 'refunded'].includes(o.status)) throw new DomainError('unpaid', 'Invoices are issued once an order is paid');
  const s = seller();
  // Place of supply: the buyer's GST registration, else their billing state, else their town's state, else ours.
  const buyerCode = gstinState(o.buyer_gstin) ?? o.billing_state_code ?? o.city_state_code ?? stateCode(o.city_state) ?? s.state_code;
  const buyer: Party = {
    name: o.buyer_name,
    address: [o.vendor_address, o.vendor_address?.includes(o.city ?? '\u0000') ? null : o.city, o.billing_pincode].filter(Boolean).join(', '),
    gstin: o.buyer_gstin,
    state: STATE_CODES[buyerCode],
    state_code: buyerCode,
  };
  const total = o.amount_inr * 100;
  const t = splitInclusive(total, GST_RATE, s.state_code, buyerCode);
  const issued = o.paid_at ?? new Date();
  const fy = financialYear(issued);
  const n = await nextNumber(db, 'invoice', fy);
  const sac = o.kind === 'service' ? process.env.INVOICE_SAC_SERVICES ?? '998599' : process.env.INVOICE_SAC ?? '998365';
  const listPaise = (o.list_price_inr ?? o.amount_inr + o.discount_inr) * 100;
  const [doc] = await db<{ id: string }[]>`
    insert into mkt.tax_documents (kind, number, fy, seq, order_id, issued_at, seller, buyer, place_of_supply, description, sac,
      list_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, rate_pct, utgst, created_by)
    values ('invoice', ${n.number}, ${fy}, ${n.seq}, ${orderId}, ${issued}, ${db.json(s as never)}, ${db.json(buyer as never)},
      ${`${buyer.state} (${buyerCode})`}, ${o.product}, ${sac}, ${listPaise}, ${o.discount_inr * 100}, ${t.taxable}, ${t.cgst}, ${t.sgst}, ${t.igst},
      ${total}, ${GST_RATE}, ${t.utgst}, ${actor})
    returning id`;
  await audit(db, actor, 'invoice.issue', 'order', orderId, { number: n.number });
  return doc.id;
}

/** A credit note for a refund, against the order's invoice, with the same tax split. Call inside the refund's transaction. */
export async function issueCreditNote(db: Db, refundId: string, actor: string | null) {
  const [r] = await db<{ order_id: string; amount_inr: number; created_at: Date }[]>`select order_id, amount_inr, created_at from mkt.refunds where id = ${refundId}`;
  if (!r) throw new DomainError('not_found', 'Refund not found');
  const [have] = await db<{ id: string }[]>`select id from mkt.tax_documents where refund_id = ${refundId}`;
  if (have) return have.id;
  const invoiceId = await ensureInvoice(db, r.order_id, actor);
  const [inv] = await db<TaxDocument[]>`select * from mkt.tax_documents where id = ${invoiceId}`;
  const total = r.amount_inr * 100;
  const t = splitInclusive(total, Number(inv.rate_pct), inv.seller.state_code, inv.buyer.state_code);
  const fy = financialYear(r.created_at);
  const n = await nextNumber(db, 'credit_note', fy);
  const [doc] = await db<{ id: string }[]>`
    insert into mkt.tax_documents (kind, number, fy, seq, order_id, refund_id, original_id, issued_at, seller, buyer, place_of_supply, description, sac,
      list_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, rate_pct, utgst, created_by)
    values ('credit_note', ${n.number}, ${fy}, ${n.seq}, ${r.order_id}, ${refundId}, ${invoiceId}, ${r.created_at}, ${db.json(inv.seller as never)},
      ${db.json(inv.buyer as never)}, ${inv.place_of_supply}, ${`Refund against ${inv.number}: ${inv.description}`}, ${inv.sac},
      ${total}, 0, ${t.taxable}, ${t.cgst}, ${t.sgst}, ${t.igst}, ${total}, ${inv.rate_pct}, ${t.utgst}, ${actor})
    returning id`;
  await audit(db, actor, 'credit_note.issue', 'order', r.order_id, { number: n.number, refundId });
  return doc.id;
}

export async function taxDocuments(db: Db, orderId: string) {
  return db<TaxDocument[]>`
    select d.*, o2.number as original_number from mkt.tax_documents d left join mkt.tax_documents o2 on o2.id = d.original_id
    where d.order_id = ${orderId} order by d.issued_at, d.number`;
}

export async function taxDocument(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [d] = await db<(TaxDocument & { profile_id: string; vendor_owner: string | null })[]>`
    select d.*, o2.number as original_number, o.profile_id, v.owner_profile_id as vendor_owner
    from mkt.tax_documents d join mkt.orders o on o.id = d.order_id left join mkt.vendors v on v.id = o.vendor_id
    left join mkt.tax_documents o2 on o2.id = d.original_id where d.id = ${id}`;
  return d ?? null;
}
