// Gives sales-site admin staff the matching access in Ops. Read-only on the sales site.
// Usage:
//   DATABASE_URL=... SALES_DATABASE_URL=... node scripts/link-sales-staff.mjs [--apply]
//   DATABASE_URL=... node scripts/link-sales-staff.mjs staff.csv [--apply]     (CSV header: email,role,active,name)
// Without --apply it prints what would change and writes nothing.
// Roles: admin -> admin, editor -> content, commercial -> ops, sales -> ops.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { parseCsv } from './csv.mjs';
import { linkSalesStaff } from '../lib/staffLink.ts';

const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');

let rows;
if (file) {
  rows = parseCsv(await readFile(file, 'utf8')).map((r) => ({
    email: r.email,
    role: r.role,
    active: !['0', 'false', 'no', 'inactive'].includes((r.active ?? 'true').toLowerCase()),
    name: r.name || null,
  }));
} else {
  if (!process.env.SALES_DATABASE_URL) {
    console.error('Give a CSV file or set SALES_DATABASE_URL');
    process.exit(1);
  }
  const sales = postgres(process.env.SALES_DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
  rows = await sales`
    select lower(u.email) as email, s.role, s.active, u.raw_user_meta_data->>'full_name' as name
    from public.partner_staff s join auth.users u on u.id = s.user_id`;
  await sales.end();
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
try {
  const res = await sql.begin((tx) => linkSalesStaff(tx, rows, { apply }));
  console.table(res);
  console.log(apply ? 'Applied.' : 'Dry run: nothing was written. Add --apply to save.');
} finally {
  await sql.end();
}
