import Link from 'next/link';
import { sql } from '@/lib/db';
import { listCategories, listCities } from '@/lib/catalog';
import { publishedRealWeddings } from '@/lib/realWeddings';
import { Container, Cover } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [cats, cities, weddings] = await Promise.all([
    listCategories(sql, { activeOnly: true }),
    listCities(sql),
    publishedRealWeddings(sql, 3),
  ]);
  const tricity = cities.slice(0, 3);
  return (
    <>
      <section className="bg-[var(--color-ink)] text-white">
        <Container className="py-12 sm:py-16">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--color-gold)]">Chandigarh · Mohali · Panchkula</p>
          <h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-3xl leading-tight sm:text-5xl">
            Every wedding vendor you need, verified before they reach you.
          </h1>
          <p className="mt-4 max-w-xl text-white/80">
            Tell us once what you need. Our team confirms your details on a short call, then only verified vendors contact you, and
            you compare their quotes in one place.
          </p>
          <form action="/vendors/go" className="mt-6 grid max-w-xl gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select name="category" className="input text-[var(--color-ink)]" aria-label="Vendor type" defaultValue={cats[0]?.slug}>
              {cats.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.plural_name}
                </option>
              ))}
            </select>
            <select name="city" className="input text-[var(--color-ink)]" aria-label="City" defaultValue={cities[0]?.slug}>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn btn-gold">Search</button>
          </form>
          <Link href="/enquire" className="mt-4 inline-block text-sm underline underline-offset-4">
            Or get quotes from several categories at once →
          </Link>
        </Container>
      </section>

      <Container className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Browse by category</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cats.map((c) => (
            <div key={c.slug} className="card p-4">
              <h3 className="font-semibold">{c.plural_name}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{c.description}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {tricity.map((city) => (
                  <li key={city.slug}>
                    <Link href={`/vendors/${city.slug}/${c.slug}`} className="underline-offset-4 hover:underline">
                      {city.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <Container className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          ['Verified, not just listed', 'Every enquiry passes a three-step check before a vendor sees it, so vendors reply to real brides.'],
          ['Your number stays private', 'Vendors reach you through OLReady first. You decide when to share your contact.'],
          ['One place for every quote', 'Chat, compare quotes and confirm bookings across makeup, photography, decor, mehendi and music.'],
        ].map(([t, d]) => (
          <div key={t} className="card p-5">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{d}</p>
          </div>
        ))}
      </Container>

      {weddings.length ? (
        <Container className="mt-12">
          <div className="flex items-end justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">Real weddings</h2>
            <Link href="/real-weddings" className="text-sm underline underline-offset-4">
              See all
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {weddings.map((w) => (
              <Link key={w.id} href={`/real-weddings/${w.slug}`} className="card block overflow-hidden">
                <div className="aspect-[4/3]">
                  <Cover url={w.cover_image_url} name={w.couple_names} />
                </div>
                <div className="p-3">
                  <p className="font-semibold">{w.couple_names}</p>
                  <p className="text-sm text-[var(--color-muted)]">{w.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      ) : null}
    </>
  );
}
