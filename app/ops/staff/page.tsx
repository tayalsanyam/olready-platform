import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { opsSetStaffRole, opsSyncSalesStaff } from '@/lib/actions/staff';
import { opsResetMfa } from '@/lib/actions/mfa';
import { Badge, Card, Field, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Staff' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin: everything, including settings and exports',
  ops: 'Ops: leads, vendors, payments, disputes',
  rm: 'Relationship manager: assigned brides only',
  content: 'Content: real weddings',
};

export default async function Staff({ searchParams }: P) {
  const q = await searchParams;
  await requireAdmin();
  const staff = await sql<{ id: string; email: string; full_name: string; role: string; role_source: string; signed_in: boolean; totp_enabled: boolean }[]>`
    select id, email, full_name, role, role_source, auth_user_id is not null as signed_in, totp_enabled
    from mkt.profiles where role in ('admin','ops','rm','content') order by role, email`;
  const salesAdmin = process.env.SALES_ADMIN_URL;
  const canSync = Boolean(process.env.SALES_DATABASE_URL);
  return (
    <>
      <PageTitle
        title="Staff"
        sub="Who can use Ops. Sales-site staff are added here by the sync; roles you set by hand stay as you set them."
        action={
          salesAdmin ? (
            <a href={salesAdmin} className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
              Open sales-site admin
            </a>
          ) : null
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-x-auto p-0">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Managed in</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.email}
                    {s.full_name ? <span className="block text-xs text-[var(--color-muted)]">{s.full_name}</span> : null}
                    {s.signed_in ? null : <span className="block text-xs text-[var(--color-muted)]">Not signed in yet</span>}
                    {s.totp_enabled ? (
                      <form action={opsResetMfa} className="mt-1">
                        <input type="hidden" name="email" value={s.email} />
                        <button className="text-xs underline">Reset authenticator</button>
                      </form>
                    ) : (
                      <span className="block text-xs text-[var(--color-muted)]">No authenticator yet</span>
                    )}
                  </td>
                  <td>{s.role}</td>
                  <td>{s.role_source === 'sales_admin' ? <Badge tone="gold">Sales admin</Badge> : <Badge>Ops</Badge>}</td>
                  <td>
                    <form action={opsSetStaffRole} className="flex gap-2">
                      <input type="hidden" name="email" value={s.email} />
                      <select name="role" defaultValue={s.role} className="input w-32 py-1" aria-label={`Role for ${s.email}`}>
                        {Object.keys(ROLE_LABEL).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        <option value="none">remove access</option>
                      </select>
                      <button className="btn btn-ghost btn-sm">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Sync from the sales-site admin</h2>
            <p className="hint mt-1">
              Admins there become admins here, editors become content staff, and commercial and sales staff get Ops. Anyone made
              inactive there loses access here.
            </p>
            {canSync ? (
              <form action={opsSyncSalesStaff} className="mt-3">
                <button className="btn btn-sm">Sync staff now</button>
              </form>
            ) : (
              <p className="hint mt-3">
                Not connected. Set SALES_DATABASE_URL, or run <code>node scripts/link-sales-staff.mjs staff.csv</code>.
              </p>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Add someone</h2>
            <form action={opsSetStaffRole} className="mt-3 space-y-3">
              <Field label="Email">
                <input name="email" type="email" required className="input" />
              </Field>
              <Field label="Role">
                <select name="role" className="input" defaultValue="ops">
                  {Object.entries(ROLE_LABEL).map(([r, l]) => (
                    <option key={r} value={r}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn btn-sm">Give access</button>
              <p className="hint">They sign in with a code sent to this email.</p>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
