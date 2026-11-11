import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { opsSaveStaffRecipients, opsSendTestAlert, opsSaveSetting } from '@/lib/actions/ops';
import { Card, Notice, PageTitle } from '@/components/ui';
import { staffRecipients } from '@/lib/alerts';

export const metadata = { title: 'Settings' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

type Def = { label: string; unit?: string; yesNo?: boolean };
// Every setting, grouped the way an admin thinks about them. A setting missing here still shows, under "Other".
const GROUPS: { title: string; hint: string; keys: Record<string, Def> }[] = [
  {
    title: 'Leads',
    hint: 'How many vendors can unlock a request, and what vendors earn for telling us about bookings.',
    keys: {
      reopen_increment: { label: 'Extra unlocks when a capped lead is reopened', unit: 'unlocks' },
      max_reopen_rounds: { label: 'Times a lead can be reopened', unit: 'times' },
      booking_reward_credits: { label: 'Credits a vendor gets for reporting a booking', unit: 'credits' },
    },
  },
  {
    title: 'Vendor calendars',
    hint: 'When brides are told a vendor is free, and when vendors are reminded.',
    keys: {
      calendar_fresh_days: { label: 'Tell brides "free" only if the calendar was updated within', unit: 'days' },
      calendar_reminder_days: { label: 'Remind a vendor whose calendar has not been updated for', unit: 'days' },
    },
  },
  {
    title: 'Reviews and bride perks',
    hint: 'Deadlines for review disputes and the perk a bride gets after booking.',
    keys: {
      review_contact_hours: { label: 'Ops must contact the vendor about a dispute within', unit: 'hours' },
      review_proof_days: { label: 'A vendor has this long to send dispute proof', unit: 'days' },
      bride_perk_claim_days: { label: 'A bride has this long to start her booking perk', unit: 'days' },
      bride_perk_length_days: { label: 'The bride perk lasts', unit: 'days' },
    },
  },
  {
    title: 'Promotions',
    hint: 'Prices and limits for Boosts and banners.',
    keys: {
      boost_price_per_visit: { label: 'Boost: price per profile visit', unit: '₹' },
      banner_price_home: { label: 'Banner on the home page, per month', unit: '₹' },
      banner_price_city: { label: 'Banner on a town page, per month', unit: '₹' },
      banner_slots: { label: 'Banner slots per page per month', unit: 'slots' },
      banners_self_serve: { label: 'Vendors can book banners themselves', yesNo: true },
    },
  },
  {
    title: 'Alerts',
    hint: 'When vendors are nudged, and when the team is told something is waiting. Choose who gets team alerts further down this page.',
    keys: {
      low_credit_threshold: { label: 'Tell a vendor when enquiries left fall to', unit: 'enquiries' },
      plan_nudge_gap_pct: { label: 'Nudge a vendor whose plan usage trails time gone by', unit: 'points' },
      plan_nudge_every_days: { label: 'Send that nudge at most once every', unit: 'days' },
      staff_alerts_on: { label: 'Alert the team when something is waiting', yesNo: true },
      staff_quiet_from_hour: { label: 'Hold team alerts from (24-hour clock)', unit: "o'clock" },
      staff_quiet_to_hour: { label: 'Send held alerts at', unit: "o'clock" },
    },
  },
  {
    title: 'Search',
    hint: 'When a page is offered to Google.',
    keys: { min_vendors_to_index: { label: 'Vendors a listing page needs before Google may index it', unit: 'vendors' } },
  },
  {
    title: 'AI limits',
    hint: 'Daily caps that keep AI costs predictable. A cap reached shows a polite "try tomorrow".',
    keys: {
      bride_assistant_on: { label: 'Ask Olready is switched on for brides', yesNo: true },
      bride_assistant_per_day: { label: 'Ask Olready: questions per bride a day', unit: 'questions' },
      bride_assistant_site_day: { label: 'Ask Olready: questions for the whole site a day', unit: 'questions' },
      bride_assistant_keep_days: { label: 'Ask Olready: delete chats not used for', unit: 'days' },
      quote_reader_site_day: { label: 'Quote reader: quotes read a day', unit: 'quotes' },
      look_per_visitor_day: { label: 'Photo search: searches per visitor a day', unit: 'searches' },
      look_site_day: { label: 'Photo search: searches for the whole site a day', unit: 'searches' },
      ops_assistant_per_person_day: { label: 'Ask the data: questions per staff member a day', unit: 'questions' },
      ops_assistant_team_day: { label: 'Ask the data: questions for the whole team a day', unit: 'questions' },
    },
  },
  {
    title: 'Security',
    hint: 'Sign-in rules for staff.',
    keys: { staff_mfa_required: { label: 'Staff must sign in with an authenticator app', yesNo: true } },
  },
];
const words = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default async function Settings({ searchParams }: P) {
  const q = await searchParams;
  await requireAdmin();
  const rows = await sql<{ key: string; value: number }[]>`select key, value from mkt.settings order by key`;
  const value = new Map(rows.map((r) => [r.key, r.value]));
  const known = new Set(GROUPS.flatMap((g) => Object.keys(g.keys)));
  const other = rows.filter((r) => !known.has(r.key) && typeof r.value === 'number');
  const team = await staffRecipients(sql);
  const groups = [...GROUPS, ...(other.length ? [{ title: 'Other', hint: '', keys: Object.fromEntries(other.map((r) => [r.key, { label: words(r.key) } as Def])) }] : [])];
  return (
    <>
      <PageTitle title="Settings" sub="Rules of the marketplace. Each one saves on its own, and every change is logged." />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 xl:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title}>
            <h2 className="font-semibold">{g.title}</h2>
            {g.hint ? <p className="hint">{g.hint}</p> : null}
            <ul className="mt-2 divide-y divide-[var(--color-line)]">
              {Object.entries(g.keys)
                .filter(([key]) => value.has(key))
                .map(([key, d]) => (
                  <li key={key}>
                    <form action={opsSaveSetting} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2">
                      <input type="hidden" name="key" value={key} />
                      <label htmlFor={`s-${key}`} className="text-sm">
                        {d.label}
                      </label>
                      {d.yesNo ? (
                        <select id={`s-${key}`} name="value" defaultValue={value.get(key) ? '1' : '0'} className="input w-28 py-1">
                          <option value="1">Yes</option>
                          <option value="0">No</option>
                        </select>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {d.unit === '₹' ? <span className="text-sm text-[var(--color-muted)]">₹</span> : null}
                          <input id={`s-${key}`} name="value" inputMode="numeric" className="input w-24 py-1 text-right" defaultValue={String(value.get(key))} />
                          {d.unit && d.unit !== '₹' ? <span className="hidden w-16 text-xs text-[var(--color-muted)] sm:inline">{d.unit}</span> : null}
                        </span>
                      )}
                      <button className="btn btn-ghost btn-sm">Save</button>
                    </form>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="mt-5 scroll-mt-24" id="team-alerts">
        <h2 className="font-semibold">Who gets team alerts</h2>
        <p className="hint">
          These people hear when something is waiting in Ops: a new request, a bank transfer, a profile or claim to review, a plan waiting for its contract, a dispute,
          or a relationship-manager request. One per line. WhatsApp alerts also need the &quot;Team alert&quot; message switched on under{' '}
          <Link href="/ops/whatsapp" className="underline">
            WhatsApp
          </Link>
          .
        </p>
        <form action={opsSaveStaffRecipients} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Emails</span>
            <textarea name="emails" rows={4} className="input" defaultValue={team.emails.join('\n')} placeholder={'ops@olready.in\nkanika@olready.in'} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">WhatsApp numbers</span>
            <textarea name="phones" rows={4} className="input" defaultValue={team.phones.join('\n')} placeholder={'98765 43210'} inputMode="tel" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className="btn btn-sm">Save who gets alerts</button>
            <button formAction={opsSendTestAlert} formNoValidate className="btn btn-ghost btn-sm">
              Send a test alert
            </button>
          </div>
        </form>
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
