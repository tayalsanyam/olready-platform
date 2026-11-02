import 'server-only';
import postgres from 'postgres';
import { DomainError } from './db';
import type { StaffRow } from './staffLink';

/** Reads the sales-site staff list straight from its database (read-only). */
export async function readSalesStaff(): Promise<StaffRow[]> {
  const url = process.env.SALES_DATABASE_URL;
  if (!url) throw new DomainError('not_configured', 'Set SALES_DATABASE_URL to sync from the sales admin');
  const sales = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    return await sales<StaffRow[]>`
      select lower(u.email) as email, s.role, s.active, u.raw_user_meta_data->>'full_name' as name
      from public.partner_staff s join auth.users u on u.id = s.user_id`;
  } finally {
    await sales.end();
  }
}

