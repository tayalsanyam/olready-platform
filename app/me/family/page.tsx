import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { members, weddingFor } from '@/lib/weddings';
import { joinWeddingAction } from '@/lib/actions/bride';
import { Card, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Family', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Family({ searchParams }: P) {
  const q = await searchParams;
  const p = await requireProfile('/me/family');
  const w = await weddingFor(sql, p.id);
  const people = w ? await members(sql, w.id) : [];
  return (
    <>
      <PageTitle title="Family" sub="Your partner and family can see requests, chat with vendors, and help with the shortlist and guest list." />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 sm:grid-cols-2">
        {w ? (
          <Card>
            <h2 className="font-semibold">Invite family</h2>
            <p className="mt-1 text-sm">Ask them to sign in to Olready and enter this code under Family:</p>
            <p className="mt-3 font-mono text-3xl tracking-[0.3em]">{w.join_code}</p>
            <ul className="mt-4 divide-y divide-[var(--color-line)] text-sm">
              {people.map((m) => (
                <li key={m.profile_id} className="flex justify-between py-1.5">
                  <span>{m.full_name || m.email}</span>
                  <span className="text-[var(--color-muted)]">{m.role}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <h2 className="font-semibold">Join a wedding</h2>
          <form action={joinWeddingAction} className="mt-2 space-y-2">
            <Field label="Code from the bride or groom">
              <input name="code" required className="input font-mono uppercase tracking-widest" maxLength={8} />
            </Field>
            <select name="role" className="input" aria-label="I am">
              <option value="family">Family</option>
              <option value="partner">Partner</option>
              <option value="planner">Planner</option>
            </select>
            <button className="btn btn-sm">Join</button>
          </form>
        </Card>
      </div>
    </>
  );
}
