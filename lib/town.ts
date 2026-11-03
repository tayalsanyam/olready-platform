import { cookies } from 'next/headers';
import type { Db } from './db';
import { getCityBySlug } from './catalog';

/** The town the visitor last browsed (cookie set by RememberTown), or null. */
export async function rememberedTown(db: Db) {
  const slug = (await cookies()).get('olr_town')?.value;
  return slug && /^[a-z0-9-]{2,60}$/.test(slug) ? getCityBySlug(db, slug) : null;
}
