import { audit, DomainError, type Db } from './db';

/** A vendor's price list: what they sell, for how much, per what. Brides read it on the profile. */

export const UNITS = { event: 'per function', day: 'per day', hour: 'per hour', plate: 'per plate', person: 'per person', piece: 'each', hand: 'per hand', set: 'per set' } as const;
export type Unit = keyof typeof UNITS;
export type Offer = { id: string; name: string; price_inr: number | null; unit: Unit; onwards: boolean; details: string; sort: number };
export const MAX_OFFERS = 12;

export async function offersFor(db: Db, vendorId: string) {
  return db<Offer[]>`select id, name, price_inr, unit, onwards, details, sort from mkt.vendor_offers where vendor_id = ${vendorId} order by sort, created_at`;
}

/** Reads rows named offer_name_0, offer_price_0, offer_unit_0, offer_onwards_0, offer_details_0 … */
export function offersFromForm(fd: FormData) {
  const out: Omit<Offer, 'id' | 'sort'>[] = [];
  for (let i = 0; i < MAX_OFFERS + 4; i++) {
    const name = String(fd.get(`offer_name_${i}`) ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2) continue;
    const rawPrice = String(fd.get(`offer_price_${i}`) ?? '').replace(/[^\d]/g, '');
    const unit = String(fd.get(`offer_unit_${i}`) ?? 'event');
    const details = String(fd.get(`offer_details_${i}`) ?? '').trim().slice(0, 300);
    // The price list is public: contact details stay behind the request.
    if (/\d{10}|@\w+\.\w|wa\.me|instagram\.com/i.test(`${name} ${details}`.replace(/[\s-]/g, ''))) throw new DomainError('offer_contact', 'Keep phone numbers and links out of the price list');
    out.push({ name, price_inr: rawPrice ? Math.min(Number(rawPrice), 50_000_000) : null, unit: (unit in UNITS ? unit : 'event') as Unit, onwards: fd.get(`offer_onwards_${i}`) === 'on', details });
  }
  if (out.length > MAX_OFFERS) throw new DomainError('too_many_offers', `A price list holds up to ${MAX_OFFERS} lines`);
  return out;
}

export async function saveOffers(db: Db, vendorId: string, offers: Omit<Offer, 'id' | 'sort'>[], actor: string) {
  await db`delete from mkt.vendor_offers where vendor_id = ${vendorId}`;
  for (const [i, o] of offers.entries()) {
    await db`insert into mkt.vendor_offers (vendor_id, name, price_inr, unit, onwards, details, sort) values (${vendorId}, ${o.name}, ${o.price_inr}, ${o.unit}, ${o.onwards}, ${o.details}, ${i})`;
  }
  await audit(db, actor, 'vendor.offers', 'vendor', vendorId, { lines: offers.length });
}

export const priceLine = (o: Pick<Offer, 'price_inr' | 'unit' | 'onwards'>) =>
  o.price_inr == null ? 'On request' : `₹${new Intl.NumberFormat('en-IN').format(o.price_inr)}${o.onwards ? ' onwards' : ''} ${UNITS[o.unit]}`;
