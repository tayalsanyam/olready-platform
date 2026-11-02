'use server';

import { audit, DomainError, sql } from '../db';
import { requireRole } from '../auth';
import { linkSalesStaff } from '../staffLink';
import { readSalesStaff } from '../salesStaff';
import { attempt, str } from './run';

const STAFF_ROLES = ['ops', 'rm', 'content', 'admin'] as const;

export async function opsSyncSalesStaff() {
  await attempt('/ops/staff', async () => {
    const me = await requireRole(['admin']);
    const rows = await readSalesStaff();
    const res = await sql.begin((tx) => linkSalesStaff(tx, rows, { apply: true }));
    await audit(sql, me.id, 'staff.sync', 'profile', null, { rows: rows.length });
    const n = (k: string) => res.filter((r) => r.outcome === k).length;
    return { ok: `Synced ${rows.length} sales-admin staff: ${n('created')} added, ${n('updated')} updated, ${n('removed')} removed, ${n('skipped')} skipped` };
  });
}

export async function opsSetStaffRole(fd: FormData) {
  await attempt('/ops/staff', async () => {
    const me = await requireRole(['admin']);
    const email = str(fd, 'email').toLowerCase();
    const role = str(fd, 'role');
    if (!email.includes('@')) throw new DomainError('bad_email', 'Enter an email address');
    if (role !== 'none' && !STAFF_ROLES.includes(role as never)) throw new DomainError('bad_role', 'Pick a role');
    if (email === me.email?.toLowerCase() && role !== 'admin') throw new DomainError('self', 'You cannot remove your own admin access');
    const [p] = await sql<{ id: string; role: string }[]>`select id, role from mkt.profiles where email = ${email}`;
    if (p?.role === 'vendor') throw new DomainError('vendor', 'This email belongs to a vendor account');
    const next = role === 'none' ? 'bride' : role;
    // A role set here is owned by Ops; the sales-admin sync leaves it alone from now on.
    const [saved] = p
      ? await sql<{ id: string }[]>`update mkt.profiles set role = ${next}, role_source = 'platform' where id = ${p.id} returning id`
      : await sql<{ id: string }[]>`insert into mkt.profiles (email, role, role_source) values (${email}, ${next}, 'platform') returning id`;
    await audit(sql, me.id, 'staff.set_role', 'profile', saved.id, { from: p?.role ?? null, to: next });
    return { ok: role === 'none' ? `${email} no longer has staff access` : `${email} is now ${next}` };
  });
}
