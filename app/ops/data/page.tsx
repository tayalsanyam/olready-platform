import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { DATASETS } from '@/lib/opsData';
import { Card, Notice, PageTitle } from '@/components/ui';
import { sql } from '@/lib/db';
import { demoCounts } from '@/lib/demoData';
import { opsRemoveDemo } from '@/lib/actions/ops';

export const metadata = { title: 'Data' };

export default async function OpsData({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole(['ops', 'admin'], '/ops/data');
  const groups = [...new Set(DATASETS.map((d) => d.group))];
  const demo = me.role === 'admin' ? await demoCounts(sql, me.id) : null;
  return (
    <>
      <PageTitle
        title="Data"
        sub={me.role === 'admin' ? 'Every list, with search and filters. Download any list as it is filtered on screen.' : 'Every list, with search and filters. Only admins can download.'}
        action={
          <Link href="/ops/assistant" className="btn btn-sm">
            Ask a question about the data
          </Link>
        }
      />
      <Notice ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g}>
            <h2 className="font-semibold">{g}</h2>
            <ul className="mt-2 divide-y divide-[var(--color-line)]">
              {DATASETS.filter((d) => d.group === g).map((d) => (
                <li key={d.key}>
                  <Link href={`/ops/data/${d.key}`} className="block py-2.5 hover:text-[var(--color-pink-deep)]">
                    <span className="font-medium">{d.label}</span>
                    <span className="block text-sm text-[var(--color-muted)]">{d.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {demo && demo.vendors + demo.people + demo.leads + demo.weddings > 0 ? (
        <Card className="mt-5 border-amber-300">
          <h2 className="font-semibold">Demo data is on this site</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {demo.vendors} demo vendors, {demo.people} demo people, {demo.leads} demo requests and {demo.weddings} demo wedding stories are visible to
            visitors. Remove them before real brides arrive. {demo.touched ? `${demo.touched} conversations with demo vendors go with them. ` : ''}
            Guides, categories, towns and settings stay. This cannot be undone.
          </p>
          <form action={opsRemoveDemo} className="mt-3 flex flex-wrap items-center gap-2">
            <input name="confirm" className="input w-56 py-1.5" placeholder="Type REMOVE DEMO" aria-label="Type REMOVE DEMO to confirm" autoComplete="off" />
            <button className="btn btn-sm">Remove demo data</button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
