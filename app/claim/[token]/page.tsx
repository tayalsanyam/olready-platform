import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { claimAction } from '@/lib/actions/public';
import { Card, Container, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Claim your profile', robots: { index: false } };

type P = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function Claim({ params, searchParams }: P) {
  const { token } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const [c] = await sql<{ status: string; business_name: string; category: string; city: string; invite_email: string }[]>`
    select vc.status, v.business_name, c.name as category, ci.name as city, vc.invite_email
    from mkt.vendor_claims vc join mkt.vendors v on v.id = vc.vendor_id
    join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    where vc.token = ${token}`;
  if (!c) notFound();
  const me = await currentProfile();
  return (
    <Container className="max-w-md">
      <Card className="p-6">
        <h1 className="font-semibold text-2xl">Claim {c.business_name}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {c.category} · {c.city}. The profile stays private until you claim it and our team confirms you own the business.
        </p>
        <div className="mt-4">
          <Notice error={q.error} ok={q.ok} />
        </div>
        {c.status === 'invited' ? (
          <form action={claimAction}>
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-pink w-full">{me ? 'Claim this profile' : 'Sign in to claim'}</button>
          </form>
        ) : (
          <p className="text-sm">This claim is {c.status}.</p>
        )}
      </Card>
    </Container>
  );
}
