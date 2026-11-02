// Keeps platform staff roles in step with the sales-site admin (public.partner_staff).
// Type-only imports keep this file loadable by plain Node scripts.
import type { Db } from './db';

export type SalesRole = 'admin' | 'editor' | 'commercial' | 'sales';
export type StaffRow = { email: string; role: string; active: boolean; name?: string | null };
export type LinkResult = { email: string; outcome: 'created' | 'updated' | 'unchanged' | 'removed' | 'skipped'; role?: string; note?: string };

/** Sales-site role to platform role. Editors manage content; commercial and sales staff work the Ops queues. */
export const ROLE_MAP: Record<SalesRole, 'admin' | 'content' | 'ops'> = {
  admin: 'admin',
  editor: 'content',
  commercial: 'ops',
  sales: 'ops',
};
const STAFF = ['ops', 'rm', 'content', 'admin'];

export async function linkSalesStaff(db: Db, rows: StaffRow[], opts: { apply: boolean }): Promise<LinkResult[]> {
  const out: LinkResult[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const email = r.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      out.push({ email: r.email ?? '', outcome: 'skipped', note: 'no valid email' });
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const mapped = ROLE_MAP[r.role as SalesRole];
    if (!mapped) {
      out.push({ email, outcome: 'skipped', note: `unknown sales role "${r.role}"` });
      continue;
    }
    const [p] = await db<{ id: string; role: string; role_source: string }[]>`
      select id, role, role_source from mkt.profiles where email = ${email}`;

    if (!r.active) {
      // Removed from the sales admin: drop platform staff access only if the sync granted it.
      if (p && p.role_source === 'sales_admin' && STAFF.includes(p.role)) {
        if (opts.apply) {
          await db`update mkt.profiles set role = 'bride', role_source = 'platform' where id = ${p.id}`;
          await auditRow(db, 'staff.sync_remove', p.id, { from: p.role });
        }
        out.push({ email, outcome: 'removed', role: 'bride', note: `was ${p.role}` });
      } else out.push({ email, outcome: 'unchanged', note: 'inactive in sales admin' });
      continue;
    }

    if (!p) {
      if (opts.apply) {
        const [created] = await db<{ id: string }[]>`
          insert into mkt.profiles (email, full_name, role, role_source)
          values (${email}, ${r.name ?? ''}, ${mapped}, 'sales_admin') returning id`;
        await auditRow(db, 'staff.sync_create', created.id, { role: mapped });
      }
      out.push({ email, outcome: 'created', role: mapped, note: 'linked on first sign-in with this email' });
      continue;
    }
    if (p.role === 'vendor') {
      out.push({ email, outcome: 'skipped', note: 'this email belongs to a vendor account; change it by hand in Ops' });
      continue;
    }
    if (p.role_source === 'platform' && STAFF.includes(p.role)) {
      // Set by hand in Ops (for example an RM): the platform decision wins.
      out.push({ email, outcome: 'unchanged', role: p.role, note: 'role set in Ops, left as is' });
      continue;
    }
    if (p.role === mapped && p.role_source === 'sales_admin') {
      out.push({ email, outcome: 'unchanged', role: mapped });
      continue;
    }
    if (opts.apply) {
      await db`update mkt.profiles set role = ${mapped}, role_source = 'sales_admin' where id = ${p.id}`;
      await auditRow(db, 'staff.sync_update', p.id, { from: p.role, to: mapped });
    }
    out.push({ email, outcome: 'updated', role: mapped, note: `was ${p.role}` });
  }
  return out;
}

async function auditRow(db: Db, action: string, profileId: string, data: Record<string, unknown>) {
  await db`
    insert into mkt.audit_log (actor_profile_id, action, entity, entity_id, data)
    values (null, ${action}, 'profile', ${profileId}, ${db.json(data as never)})`;
}
