import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { WA_EVENTS, waProvider, type WaEvent } from '@/lib/whatsapp';
import { saveWhatsAppTemplate, sendWhatsAppTest } from '@/lib/actions/whatsapp';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'WhatsApp' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) => (d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '–');

export default async function OpsWhatsApp({ searchParams }: P) {
  const me = await requireRole(['ops', 'admin'], '/ops/whatsapp');
  const q = await searchParams;
  const admin = me.role === 'admin';
  const provider = waProvider();
  const [templates, counts, recent, optIns] = await Promise.all([
    sql<{ event: WaEvent; template_name: string; language: string; enabled: boolean; updated_at: Date }[]>`select * from mkt.whatsapp_templates`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from mkt.whatsapp_outbox where created_at > now() - interval '7 days' group by status`,
    sql<{ id: string; to_phone: string; event: WaEvent; status: string; error: string | null; created_at: Date; sent_at: Date | null }[]>`
      select id, to_phone, event, status, error, created_at, sent_at from mkt.whatsapp_outbox order by created_at desc limit 40`,
    sql<{ brides: number; vendors: number; stops: number }[]>`
      select (select count(*)::int from mkt.leads where whatsapp_opt_in) as brides,
             (select count(*)::int from mkt.vendors where whatsapp_alerts) as vendors,
             (select count(*)::int from mkt.whatsapp_optouts) as stops`,
  ]);
  const byEvent = new Map(templates.map((t) => [t.event, t]));
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n]));
  return (
    <>
      <PageTitle
        title="WhatsApp"
        sub="Template messages for brides who ticked the WhatsApp box on their request, and vendors who turned alerts on. A STOP reply switches a number off everywhere."
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Channel</p>
          <p className="mt-1 font-semibold">{provider ? (provider === 'meta' ? 'Meta Cloud API' : 'Wati') : 'Off'}</p>
          {!provider ? <p className="hint">Set WHATSAPP_PROVIDER and its keys to turn it on.</p> : null}
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Last 7 days</p>
          <p className="mt-1 font-semibold">
            {(c.sent ?? 0) + (c.delivered ?? 0) + (c.read ?? 0)} sent · {c.read ?? 0} read
          </p>
          <p className="hint">
            {c.queued ?? 0} waiting · {c.failed ?? 0} failed
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Opted in</p>
          <p className="mt-1 font-semibold">
            {optIns[0].brides} requests · {optIns[0].vendors} vendors
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Replied STOP</p>
          <p className="mt-1 font-semibold">{optIns[0].stops}</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">Messages</h2>
        <p className="hint">
          Create each template in WhatsApp Manager (or Wati) as a Utility template with the variables in this order, wait for approval, then enter its name
          here and switch it on.{admin ? '' : ' Only admins can change these.'}
        </p>
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {(Object.keys(WA_EVENTS) as WaEvent[]).map((e) => {
            const def = WA_EVENTS[e];
            const t = byEvent.get(e);
            return (
              <li key={e} className="grid gap-3 py-4 lg:grid-cols-[1fr_420px]">
                <div>
                  <p className="font-medium">
                    {def.label} <Badge>{def.who === 'bride' ? 'To brides' : 'To vendors'}</Badge>{' '}
                    {t?.enabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}
                  </p>
                  <p className="mt-1 rounded-lg bg-[var(--color-tint)] p-2 text-sm">{def.sample}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">Variables: {def.params.map((p, i) => `{{${i + 1}}} ${p}`).join(', ')}</p>
                </div>
                <form action={saveWhatsAppTemplate} className="grid grid-cols-[1fr_80px] gap-2 self-start">
                  <input type="hidden" name="event" value={e} />
                  <input name="template_name" className="input" defaultValue={t?.template_name} placeholder="approved_template_name" aria-label={`${def.label} template name`} disabled={!admin} />
                  <input name="language" className="input" defaultValue={t?.language ?? 'en'} aria-label="Language" disabled={!admin} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="enabled" defaultChecked={t?.enabled} className="h-4 w-4 accent-[var(--color-pink)]" disabled={!admin} />
                    Send this message
                  </label>
                  <button className="btn btn-ghost btn-sm" disabled={!admin}>
                    Save
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="font-semibold">Send a test</h2>
          <p className="hint">Sends one template to your own number with sample details.</p>
          <form action={sendWhatsAppTest} className="mt-3 grid gap-2">
            <select name="event" className="input" aria-label="Message">
              {(Object.keys(WA_EVENTS) as WaEvent[]).map((e) => (
                <option key={e} value={e}>
                  {WA_EVENTS[e].label}
                </option>
              ))}
            </select>
            <input name="phone" className="input" placeholder="98xxx xxxxx" inputMode="tel" aria-label="Phone" />
            <button className="btn btn-sm justify-self-start" disabled={!provider}>
              Send test
            </button>
          </form>
        </Card>
        <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <h2 className="font-semibold">Recent messages</h2>
          {recent.length ? (
            <table className="data stack mt-2">
              <thead>
                <tr>
                  <th>To</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Queued</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">…{r.to_phone.slice(-4)}</td>
                    <td>{WA_EVENTS[r.event]?.label ?? r.event}</td>
                    <td>
                      <Badge tone={r.status === 'failed' ? 'warn' : r.status === 'read' || r.status === 'delivered' ? 'ok' : 'plain'}>{r.status}</Badge>
                      {r.error ? <span className="block text-xs text-[var(--color-muted)]">{r.error}</span> : null}
                    </td>
                    <td>{fmt(r.created_at)}</td>
                    <td>{fmt(r.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-muted)]">Nothing sent yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
