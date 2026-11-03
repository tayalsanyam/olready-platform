import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { opsSaveSetting } from '@/lib/actions/ops';
import { Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Settings' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const labels: Record<string, string> = {
  reopen_increment: 'Unlocks added when a capped lead is reopened',
  max_reopen_rounds: 'Maximum reopen rounds per lead',
  booking_reward_credits: 'Credits a vendor gets for reporting a booking',
  min_vendors_to_index: 'Vendors needed before a landing page is indexed by Google',
  bride_perk_claim_days: 'Days a bride has to start her booking perk',
  bride_perk_length_days: 'Days the bride perk lasts once started',
  review_contact_hours: 'Hours Ops has to contact a vendor about a dispute',
  review_proof_days: 'Days a vendor has to send dispute proof',
  boost_price_per_visit: 'Boost: rupees per profile visit',
  banner_price_home: 'Banner: home page, rupees a month',
  banner_price_city: 'Banner: city page, rupees a month',
  banner_slots: 'Banner slots per page per month',
  banners_self_serve: 'Vendors can book banners themselves (1 yes, 0 no)',
  staff_mfa_required: 'Staff must use an authenticator app (1 yes, 0 no)',
  look_per_visitor_day: 'Photo searches per visitor a day',
  look_site_day: 'Photo searches for the whole site a day',
  ops_assistant_per_person_day: 'Ask the data: questions per staff member a day',
  ops_assistant_team_day: 'Ask the data: questions for the whole team a day',
  quote_reader_site_day: 'Quote reader: quotes read a day',
  bride_assistant_on: 'Ask OLReady for brides is on (1 yes, 0 no)',
  bride_assistant_per_day: 'Ask OLReady: questions per bride a day',
  bride_assistant_site_day: 'Ask OLReady: questions for the whole site a day',
  bride_assistant_keep_days: 'Ask OLReady: delete chats unused for this many days',
};

export default async function Settings({ searchParams }: P) {
  const q = await searchParams;
  await requireAdmin();
  const rows = await sql<{ key: string; value: number }[]>`select key, value from mkt.settings order by key`;
  return (
    <>
      <PageTitle title="Settings" sub="Rules of the marketplace. Every change is logged." />
      <Notice error={q.error} ok={q.ok} />
      <Card>
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((r) => (
            <li key={r.key}>
              <form action={opsSaveSetting} className="flex flex-wrap items-center gap-3 py-2">
                <input type="hidden" name="key" value={r.key} />
                <span className="flex-1 text-sm">{labels[r.key] ?? r.key}</span>
                <input name="value" className="input w-24 py-1" defaultValue={String(r.value)} aria-label={labels[r.key] ?? r.key} />
                <button className="btn btn-ghost btn-sm">Save</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-5">
        <h2 className="font-semibold">Exports (admin only)</h2>
        <p className="hint">Staff roles can view but not download. Every list in Data can be filtered, then downloaded.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/ops/data" className="btn btn-ghost btn-sm">
            Open Data
          </Link>
          {['vendors', 'leads', 'orders', 'unlocks'].map((t) => (
            <a key={t} href={`/ops/export?set=${t}`} className="btn btn-ghost btn-sm">
              {t}.csv
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}
