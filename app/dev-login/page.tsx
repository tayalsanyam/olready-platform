import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile, devAuthEnabled } from '@/lib/auth';
import { devSignIn, signOut } from '@/lib/actions/auth';
import { Card, Container, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Developer sign-in', robots: { index: false } };

/** Local development only (DEV_AUTH=1 and not production). */
export default async function DevLogin() {
  if (!devAuthEnabled()) notFound();
  const me = await currentProfile();
  const people = await sql<{ id: string; full_name: string; role: string; email: string }[]>`
    select id, full_name, role, email from mkt.profiles order by
      array_position(array['admin','ops','content','rm','vendor','bride'], role), full_name limit 60`;
  return (
    <Container className="max-w-2xl">
      <PageTitle title="Developer sign-in" sub="Pick a seeded person. This page does not exist in production." />
      {me ? (
        <form action={signOut} className="mb-4">
          <button className="btn btn-ghost btn-sm">Sign out {me.full_name}</button>
        </form>
      ) : null}
      <Card>
        <ul className="divide-y divide-[var(--color-line)]">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <div className="font-semibold">{p.full_name}</div>
                <div className="hint">
                  {p.role} · {p.email}
                </div>
              </div>
              <form action={devSignIn}>
                <input type="hidden" name="profile_id" value={p.id} />
                <button className="btn btn-sm">Sign in</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </Container>
  );
}
