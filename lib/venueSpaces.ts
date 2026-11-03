import type { Db } from './db';
import { DomainError } from './db';

export type Space = { id: string; name: string; kind: 'indoor' | 'outdoor' | 'poolside' | 'terrace'; seating: number | null; floating: number | null };
export const SPACE_KINDS: Record<Space['kind'], string> = { indoor: 'Indoor hall', outdoor: 'Lawn or outdoor', poolside: 'Poolside', terrace: 'Terrace' };

export async function spacesFor(db: Db, vendorId: string) {
  return db<Space[]>`select id, name, kind, seating, floating from mkt.venue_spaces where vendor_id = ${vendorId} order by sort, name`;
}

export async function addSpace(db: Db, vendorId: string, input: { name: string; kind: string; seating: number | null; floating: number | null }) {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new DomainError('name', 'Name the hall or lawn');
  if (!(input.kind in SPACE_KINDS)) throw new DomainError('kind', 'Pick the kind of space');
  const ok = (n: number | null) => n == null || (Number.isInteger(n) && n >= 1 && n <= 20000);
  if (!ok(input.seating) || !ok(input.floating)) throw new DomainError('capacity', 'Capacity must be a whole number up to 20,000');
  if (input.seating == null && input.floating == null) throw new DomainError('capacity', 'Add seating or floating capacity');
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.venue_spaces where vendor_id = ${vendorId}`;
  if (n >= 20) throw new DomainError('too_many', 'Up to 20 spaces per venue');
  await db`insert into mkt.venue_spaces (vendor_id, name, kind, seating, floating, sort) values (${vendorId}, ${name}, ${input.kind}, ${input.seating}, ${input.floating}, ${n})`;
}

export async function removeSpace(db: Db, vendorId: string, id: string) {
  await db`delete from mkt.venue_spaces where id = ${id} and vendor_id = ${vendorId}`;
}
