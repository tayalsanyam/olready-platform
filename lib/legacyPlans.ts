// Carries live plans and their unused credits over from the Laravel merchant site.
// Type-only imports keep this file loadable by plain Node scripts.
import type { Db } from './db';

/** One CSV row per plan still running on the old site. */
export type LegacyPlanRow = {
  ref: string; // the old site's subscription or invoice number; makes re-runs safe
  legacy_artist_id: string;
  plan: string; // pro | phoenix | privy
  starts_at: string;
  ends_at: string;
  credits_remaining: string;
  invoice_url?: string;
  contract_url?: string;
};
export type PlanResult = { ref: string; outcome: 'created' | 'updated' | 'skipped'; note?: string };

export async function importLegacyPlans(db: Db, rows: LegacyPlanRow[], now = new Date()): Promise<PlanResult[]> {
  const out: PlanResult[] = [];
  for (const r of rows) {
    const ref = (r.ref ?? '').trim();
    const skip = (note: string) => out.push({ ref, outcome: 'skipped', note });
    if (!ref) {
      skip('missing ref');
      continue;
    }
    const [v] = await db<{ id: string }[]>`select id from mkt.vendors where legacy_artist_id = ${Number(r.legacy_artist_id) || -1}`;
    if (!v) {
      skip(`no vendor with legacy id ${r.legacy_artist_id}; import artists first`);
      continue;
    }
    const [pack] = await db<{ id: number; credits: number }[]>`
      select id, credits from mkt.packs where code = ${(r.plan ?? '').trim().toLowerCase()} and kind = 'plan'`;
    if (!pack) {
      skip(`unknown plan "${r.plan}"`);
      continue;
    }
    const starts = new Date(r.starts_at);
    const ends = new Date(r.ends_at);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
      skip('start or end date is missing or out of order');
      continue;
    }
    if (ends <= now) {
      skip('plan already ended');
      continue;
    }
    const left = Number(r.credits_remaining);
    if (!Number.isInteger(left) || left < 0 || left > pack.credits) {
      skip(`credits_remaining must be a whole number from 0 to ${pack.credits}`);
      continue;
    }
    const invoice = r.invoice_url?.trim() || null;
    const contract = r.contract_url?.trim() || null;

    const [existing] = await db<{ id: string }[]>`select id from mkt.vendor_subscriptions where legacy_ref = ${ref}`;
    let subId: string;
    if (existing) {
      subId = existing.id;
      await db`
        update mkt.vendor_subscriptions set vendor_id = ${v.id}, pack_id = ${pack.id}, starts_at = ${starts}, ends_at = ${ends},
          invoice_url = coalesce(${invoice}, invoice_url), contract_url = coalesce(${contract}, contract_url)
        where id = ${subId}`;
    } else {
      // Already paid and contracted on the old site, so it starts active.
      const [s] = await db<{ id: string }[]>`
        insert into mkt.vendor_subscriptions (vendor_id, pack_id, status, invoice_url, contract_url, starts_at, ends_at, legacy_ref)
        values (${v.id}, ${pack.id}, 'active', ${invoice}, ${contract}, ${starts}, ${ends}, ${ref}) returning id`;
      subId = s.id;
    }
    // The carried-over balance is one ledger line per plan; a re-run corrects it rather than adding to it.
    const [{ carried }] = await db<{ carried: number }[]>`
      select coalesce(sum(delta), 0)::int as carried from mkt.credit_ledger
      where ref_id = ${subId} and reason = 'adjustment' and credit_kind = 'plan'`;
    const diff = left - carried;
    if (diff !== 0) {
      await db`
        insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, ref_id, note)
        values (${v.id}, 'plan', ${diff}, 'adjustment', ${subId}, ${`Carried over from the old site (${ref})`})`;
    }
    await db`
      insert into mkt.audit_log (actor_profile_id, action, entity, entity_id, data)
      values (null, 'subscription.legacy_import', 'subscription', ${subId}, ${db.json({ ref, credits: left } as never)})`;
    out.push({ ref, outcome: existing ? 'updated' : 'created', note: `${left} credits until ${ends.toISOString().slice(0, 10)}` });
  }
  return out;
}
