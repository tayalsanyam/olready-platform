import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { invites } from '@/lib/weddings';
import { saveInviteAction } from '@/lib/actions/bride';
import { Card, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'E-invite', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function InviteEditor({ searchParams }: P) {
  const q = await searchParams;
  const { w } = await requireBrideWedding('/me/invite');
  const [list, templates] = await Promise.all([
    invites(sql, w.id),
    sql<{ id: number; code: string; name: string; theme: Record<string, string> }[]>`
      select id, code, name, theme from mkt.invite_templates where active order by id`,
  ]);
  const current = list[0];
  const [full] = current
    ? await sql<{ message: string; template_id: number }[]>`select message, template_id from mkt.invites where id = ${current.id}`
    : [];
  return (
    <>
      <PageTitle
        title="E-invite"
        sub="A page with your functions and an RSVP note. Share its link on WhatsApp."
        action={
          current?.published ? (
            <Link href={`/invite/${current.slug}`} target="_blank" className="btn btn-ghost btn-sm">
              Open my invite
            </Link>
          ) : null
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <Card>
        <form action={saveInviteAction} className="space-y-4">
          <fieldset>
            <legend className="label">Design</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {templates.map((t, i) => (
                <label key={t.id} className="card flex cursor-pointer items-center gap-3 p-3">
                  <input type="radio" name="template_id" value={t.id} defaultChecked={full ? full.template_id === t.id : i === 0} />
                  <span className="h-8 w-8 rounded-full border" style={{ background: t.theme.bg, borderColor: t.theme.accent }} aria-hidden />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Headline *">
            <input name="headline" required className="input" defaultValue={current?.headline ?? w.title} />
          </Field>
          <Field label="Message">
            <textarea name="message" rows={4} className="input" defaultValue={full?.message ?? 'With the blessings of our families, we invite you to celebrate with us.'} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" defaultChecked={current?.published ?? true} className="h-4 w-4 accent-[var(--color-pink)]" />
            Publish (anyone with the link can see it)
          </label>
          <button className="btn btn-pink">Save invite</button>
        </form>
      </Card>
      <p className="hint mt-3">Functions and times come from Guests and RSVP. Each guest still answers on their own RSVP link.</p>
    </>
  );
}
