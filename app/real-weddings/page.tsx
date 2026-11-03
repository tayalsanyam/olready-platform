import Link from 'next/link';
import { sql } from '@/lib/db';
import { browseRealWeddings } from '@/lib/realWeddings';
import { listCities } from '@/lib/catalog';
import { CULTURES } from '@/lib/inviteDesign';
import { Container, Cover, Empty, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
type P = { searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ searchParams }: P) {
  const q = await searchParams;
  const filtered = Boolean(sp(q.city) || sp(q.culture));
  return {
    title: 'Real weddings',
    description: 'Real Indian weddings by town and culture, with every vendor credited.',
    alternates: { canonical: '/real-weddings' },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function RealWeddings({ searchParams }: P) {
  const q = await searchParams;
  const cities = await listCities(sql);
  const city = cities.find((c) => c.slug === sp(q.city)) ?? null;
  const culture = sp(q.culture) && CULTURES[sp(q.culture)!] ? sp(q.culture)! : null;
  const list = await browseRealWeddings(sql, { cityId: city?.id ?? null, culture, limit: 60 });
  const href = (o: { city?: string | null; culture?: string | null }) => {
    const u = new URLSearchParams();
    const c = 'city' in o ? o.city : city?.slug;
    const cu = 'culture' in o ? o.culture : culture;
    if (c) u.set('city', c);
    if (cu) u.set('culture', cu);
    const s = u.toString();
    return `/real-weddings${s ? `?${s}` : ''}`;
  };
  return (
    <Container>
      <PageTitle
        title="Real weddings"
        sub="Every vendor is credited, so you can book the team behind the look."
        action={
          <Link href="/me/real-wedding" className="btn btn-ghost btn-sm">
            Share your wedding
          </Link>
        }
      />
      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4" role="group" aria-label="City">
        <Link href={href({ city: null })} className="chip" aria-current={!city}>
          All cities
        </Link>
        {cities.slice(0, 7).map((c) => (
          <Link key={c.slug} href={href({ city: c.slug })} className="chip" aria-current={city?.slug === c.slug}>
            {c.name}
          </Link>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Culture">
        <Link href={href({ culture: null })} className="chip" aria-current={!culture}>
          All cultures
        </Link>
        {Object.entries(CULTURES)
          .filter(([k]) => k !== 'generic')
          .map(([k, c]) => (
            <Link key={k} href={href({ culture: k })} className="chip" aria-current={culture === k}>
              {c.label}
            </Link>
          ))}
      </div>
      {list.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <Link key={w.id} href={`/real-weddings/${w.slug}`} className="group block">
              <div className="aspect-[4/3] overflow-hidden rounded-[14px]">
                <Cover url={w.cover_image_url} name={w.couple_names} />
              </div>
              <p className="mt-2 font-semibold group-hover:text-[var(--color-pink-deep)]">{w.couple_names}</p>
              <p className="text-sm text-[var(--color-muted)]">
                {w.title}
                {w.city_name && !w.title.includes(w.city_name) ? `, ${w.city_name}` : ''}
                {w.vendor_count ? ` · ${w.vendor_count} vendor${w.vendor_count === 1 ? '' : 's'} credited` : ''}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No stories match">
          Try another city or culture, or <Link className="underline" href="/real-weddings">see all real weddings</Link>.
        </Empty>
      )}
    </Container>
  );
}
