import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { DATASETS } from '@/lib/opsData';
import { Card, PageTitle } from '@/components/ui';

export const metadata = { title: 'Data' };

export default async function OpsData() {
  const me = await requireRole(['ops', 'admin'], '/ops/data');
  const groups = [...new Set(DATASETS.map((d) => d.group))];
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
    </>
  );
}
