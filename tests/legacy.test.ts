import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveVendor, profile, resetDb, testSql } from './helpers';
import { linkSalesStaff } from '@/lib/staffLink';
import { importLegacyPlans } from '@/lib/legacyPlans';
import { expirePlans } from '@/lib/payments';
import { GET as packsApi } from '@/app/api/public/packs/route';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

const role = async (email: string) =>
  (await sql<{ role: string; role_source: string }[]>`select role, role_source from mkt.profiles where email = ${email}`)[0];
const balance = async (vendorId: string) =>
  (await sql<{ n: number }[]>`select coalesce(sum(delta),0)::int as n from mkt.credit_ledger where vendor_id = ${vendorId} and credit_kind = 'plan'`)[0].n;

describe('sales-admin staff sync', () => {
  it('maps roles, previews without writing, and never overrides Ops or vendors', async () => {
    const rm = await profile(sql, 'rm', 'Tanya');
    const vendor = await profile(sql, 'vendor', 'Kirti');
    const rows = [
      { email: 'Sanyam@OLReady.in', role: 'admin', active: true, name: 'Sanyam' },
      { email: 'kanika@olready.in', role: 'editor', active: true },
      { email: 'deals@olready.in', role: 'commercial', active: true },
      { email: rm.email, role: 'sales', active: true },
      { email: vendor.email, role: 'sales', active: true },
      { email: 'ghost@olready.in', role: 'owner', active: true },
    ];
    const preview = await linkSalesStaff(sql, rows, { apply: false });
    expect(preview.map((r) => r.outcome)).toEqual(['created', 'created', 'created', 'unchanged', 'skipped', 'skipped']);
    expect(await role('sanyam@olready.in')).toBeUndefined();

    await linkSalesStaff(sql, rows, { apply: true });
    expect(await role('sanyam@olready.in')).toEqual({ role: 'admin', role_source: 'sales_admin' });
    expect((await role('kanika@olready.in')).role).toBe('content');
    expect((await role('deals@olready.in')).role).toBe('ops');
    expect((await role(rm.email)).role).toBe('rm');
    expect((await role(vendor.email)).role).toBe('vendor');

    // Running again changes nothing.
    const again = await linkSalesStaff(sql, rows, { apply: true });
    expect(again.filter((r) => ['created', 'updated', 'removed'].includes(r.outcome))).toHaveLength(0);
  });

  it('removes access when someone is deactivated in the sales admin, but only access the sync gave', async () => {
    await linkSalesStaff(sql, [{ email: 'temp@olready.in', role: 'sales', active: true }], { apply: true });
    const handSet = await profile(sql, 'ops', 'Hand set');
    const res = await linkSalesStaff(
      sql,
      [
        { email: 'temp@olready.in', role: 'sales', active: false },
        { email: handSet.email, role: 'sales', active: false },
      ],
      { apply: true }
    );
    expect(res.map((r) => r.outcome)).toEqual(['removed', 'unchanged']);
    expect((await role('temp@olready.in')).role).toBe('bride');
    expect((await role(handSet.email)).role).toBe('ops');
    const [log] = await sql`select 1 from mkt.audit_log where action = 'staff.sync_remove'`;
    expect(log).toBeTruthy();
  });
});

describe('Laravel plan carry-over', () => {
  it('starts running plans active with their remaining credits, and re-runs correct instead of doubling', async () => {
    const owner = await profile(sql, 'vendor', 'Legacy MUA');
    const v = await liveVendor(sql, owner.id, 'bridal-makeup', 'chandigarh', 'Legacy MUA');
    await sql`update mkt.vendors set legacy_artist_id = 4101 where id = ${v.id}`;
    const future = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    const row = {
      ref: 'INV-77',
      legacy_artist_id: '4101',
      plan: 'Pro',
      starts_at: '2026-09-01',
      ends_at: future,
      credits_remaining: '23',
    };
    const res = await importLegacyPlans(sql, [
      row,
      { ...row, ref: 'INV-78', ends_at: '2026-10-01' },
      { ...row, ref: 'INV-79', legacy_artist_id: '999999' },
      { ...row, ref: 'INV-80', credits_remaining: '61' },
      { ...row, ref: 'INV-81', plan: 'gold' },
    ]);
    expect(res.map((r) => r.outcome)).toEqual(['created', 'skipped', 'skipped', 'skipped', 'skipped']);
    expect(res[1].note).toMatch(/ended/);
    expect(res[3].note).toMatch(/0 to 60/);
    const [sub] = await sql`select status, ends_at from mkt.vendor_subscriptions where legacy_ref = 'INV-77'`;
    expect(sub.status).toBe('active');
    expect(await balance(v.id)).toBe(23);

    // The old site's numbers were corrected: re-import adjusts to 20, no second plan.
    const again = await importLegacyPlans(sql, [{ ...row, credits_remaining: '20' }]);
    expect(again[0].outcome).toBe('updated');
    expect(await balance(v.id)).toBe(20);
    const [{ n }] = await sql`select count(*)::int as n from mkt.vendor_subscriptions where vendor_id = ${v.id}`;
    expect(n).toBe(1);

    // Carried-over credits expire with the plan like any plan credit.
    await sql`update mkt.vendor_subscriptions set ends_at = now() - interval '1 minute' where legacy_ref = 'INV-77'`;
    await expirePlans(sql as never);
    expect(await balance(v.id)).toBe(0);
  });
});

describe('public price list', () => {
  it('publishes active packs with GST-inclusive prices and follows Ops edits', async () => {
    await sql`update mkt.packs set price_inr = 19999 where code = 'pro'`;
    await sql`update mkt.packs set active = false where code = 'starter-5'`;
    const res = await packsApi();
    const body = await res.json();
    expect(body.gst_included).toBe(true);
    const codes = body.packs.map((p: { code: string }) => p.code);
    expect(codes).toContain('privy');
    expect(codes).not.toContain('starter-5');
    expect(body.packs.find((p: { code: string }) => p.code === 'pro').price_inr).toBe(19999);
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=300/);
  });
});
