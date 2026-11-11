import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { events, guests, rsvpSummary } from '@/lib/weddings';
import { siteUrl } from '@/lib/seo';
import { addEventAction, addGuestsAction } from '@/lib/actions/bride';
import { Card, Empty, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Guests and RSVP', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : 'Time to be fixed';

export default async function Guests({ searchParams }: P) {
  const q = await searchParams;
  const { w } = await requireBrideWedding('/me/guests');
  const [evs, list, summary] = await Promise.all([events(sql, w.id), guests(sql, w.id), rsvpSummary(sql, w.id)]);
  const waText = (name: string, token: string) =>
    encodeURIComponent(`Hi ${name}! You're invited to ${w.title}. Please tell us which functions you can join: ${siteUrl()}/rsvp/${token}`);
  return (
    <>
      <PageTitle title="Guests and RSVP" sub={`${list.length} guests. Each guest gets a personal RSVP link you can send on WhatsApp.`} />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <Card key={s.event_id}>
            <div className="font-semibold">{s.name}</div>
            <div className="mt-1 text-2xl font-semibold">{s.yes_heads}</div>
            <div className="hint">
              coming · {s.maybe} maybe · {s.no} no · {s.pending} not replied
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <h2 className="mb-2 font-semibold">Guest list</h2>
          {list.length ? (
            <table className="data stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Side</th>
                  <th>Replied</th>
                  <th>Invite</th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.id}>
                    <td>
                      {g.name}
                      {g.group_name ? <div className="hint">{g.group_name}</div> : null}
                    </td>
                    <td>{g.side}</td>
                    <td>{g.pending > 0 ? `${evs.length - g.pending} of ${evs.length}` : 'All'}</td>
                    <td className="whitespace-nowrap">
                      <a
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/${(g.phone ?? '').replace(/[^\d]/g, '').replace(/^(\d{10})$/, '91$1')}?text=${waText(g.name, g.rsvp_token)}`}
                      >
                        WhatsApp
                      </a>{' '}
                      ·{' '}
                      <a className="underline" href={`/rsvp/${g.rsvp_token}`} target="_blank">
                        link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty art="list" title="No guests yet">Paste your list on the right.</Empty>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Add guests</h2>
            <form action={addGuestsAction} className="mt-2 space-y-2">
              <textarea name="lines" rows={6} required className="input" placeholder={'One per line: Name, phone\nUncle Raj, 9876512345\nAunty Neeta'} />
              <div className="grid grid-cols-2 gap-2">
                <select name="side" className="input" aria-label="Side">
                  <option value="bride">Bride side</option>
                  <option value="groom">Groom side</option>
                  <option value="common">Both</option>
                </select>
                <input name="group" className="input" placeholder="Group (e.g. College)" />
              </div>
              <button className="btn btn-sm">Add guests</button>
            </form>
          </Card>
          <Card>
            <h2 className="font-semibold">Functions</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {evs.map((e) => (
                <li key={e.id}>
                  <b>{e.name}</b> · {fmt(e.starts_at)}
                  {e.venue ? ` · ${e.venue}` : ''}
                </li>
              ))}
            </ul>
            <form action={addEventAction} className="mt-3 space-y-2">
              <Field label="Add a function">
                <input name="name" required className="input" placeholder="Haldi" />
              </Field>
              <input name="starts_at" type="datetime-local" className="input" aria-label="Date and time" />
              <input name="venue" className="input" placeholder="Venue" />
              <button className="btn btn-sm">Add</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
