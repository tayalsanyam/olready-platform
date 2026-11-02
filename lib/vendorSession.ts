import 'server-only';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { requireProfile } from './auth';
import { vendorForOwner } from './vendors';

/** The signed-in vendor and their business; sends them to onboarding if they have none. */
export async function requireVendor(next = '/vendor') {
  const profile = await requireProfile(next);
  if (profile.role !== 'vendor' && profile.role !== 'bride') redirect('/ops');
  const vendor = await vendorForOwner(sql, profile.id);
  if (!vendor) redirect('/vendor/onboard');
  return { profile, vendor };
}
