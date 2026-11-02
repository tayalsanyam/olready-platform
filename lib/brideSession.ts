import 'server-only';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { requireProfile } from './auth';
import { weddingFor } from './weddings';

/** The signed-in bride (or family member) and her wedding; sends her to set it up if missing. */
export async function requireBrideWedding(next: string) {
  const p = await requireProfile(next);
  if (p.role !== 'bride') redirect(p.role === 'vendor' ? '/vendor' : '/ops');
  const w = await weddingFor(sql, p.id);
  if (!w) redirect('/me?ok=' + encodeURIComponent('Set up your wedding first'));
  return { p, w };
}
