import Image from 'next/image';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { fieldsFor, listCategories, listCities } from '@/lib/catalog';
import { browseVendors } from '@/lib/vendors';
import { publishedRealWeddings } from '@/lib/realWeddings';
import { currentProfile } from '@/lib/auth';
import { shortlistedIds } from '@/lib/weddings';
import { CategoryIcon, IconChat, IconPhoneOff, IconSearch, IconShield } from '@/components/icons';
import { VendorCard } from '@/components/VendorCard';
import { Container, Cover } from '@/components/ui';
import { JsonLd } from '@/components/VendorCard';
import { siteUrl } from '@/lib/seo';
import { liveBanners, sponsored } from '@/lib/promotion';
import { BannerStrip } from '@/components/BannerStrip';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [cats, cities, weddings, viewer] = await Promise.all([
    listCategories(sql, { activeOnly: true }),
    listCities(sql),
    publishedRealWeddings(sql, 3),
    currentProfile(),
  ]);
  const home = cities[0];
  const hearts = await shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null);
  // One row of vendors per category, for the city most brides plan in.
  const rows = await Promise.all(
    cats.slice(0, 3).map(async (c) => ({
      c,
      fields: await fieldsFor(sql, c.id),
      vendors: await browseVendors(sql, { categoryId: c.id, cityId: home?.id, limit: 8 }),
    }))
  );
  const [banners, promoted] = await Promise.all([liveBanners(sql, 'home'), sponsored(sql, { cityId: home?.id, placement: 'home', limit: 4 })]);
  const promotedFields = await Promise.all(promoted.map((v) => fieldsFor(sql, v.category_id)));
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'OLReady',
            url: siteUrl(),
            potentialAction: { '@type': 'SearchAction', target: `${siteUrl()}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
          },
          { '@context': 'https://schema.org', '@type': 'Organization', name: 'OLReady', url: siteUrl(), logo: `${siteUrl()}/icon.png` },
        ]}
      />
      <section className="-mt-6 bg-[var(--color-tint)]">
        <Container className="grid items-center gap-8 py-8 md:grid-cols-[1.1fr_1fr] md:py-12">
          <div>
            <h1 className="max-w-xl text-4xl leading-[1.08] sm:text-5xl">Plan your wedding with vendors we have checked first.</h1>
            <p className="mt-4 max-w-lg text-lg text-[var(--color-muted)]">
              Makeup, photography, decor, mehendi and music across Chandigarh, Mohali and Panchkula. Tell us once; our team confirms your
              details, then verified vendors send you quotes.
            </p>
            <form action="/vendors/go" className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-2 sm:flex sm:items-center sm:gap-2 sm:rounded-full">
              <label className="block flex-1 px-3 py-1 sm:py-0">
                <span className="sr-only">Vendor type</span>
                <select name="category" className="w-full bg-transparent py-2 outline-none" defaultValue={cats[0]?.slug}>
                  {cats.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.plural_name}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden className="hidden h-6 w-px bg-[var(--color-line)] sm:block" />
              <label className="block flex-1 border-t border-[var(--color-line)] px-3 py-1 sm:border-0 sm:py-0">
                <span className="sr-only">City</span>
                <select name="city" className="w-full bg-transparent py-2 outline-none" defaultValue={home?.slug}>
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-pink mt-2 w-full sm:mt-0 sm:w-auto">
                <IconSearch size={18} />
                Search
              </button>
            </form>
            <p className="mt-3 text-sm">
              Need several vendors?{' '}
              <Link href="/enquire" className="font-semibold text-[var(--color-pink-deep)] underline underline-offset-4">
                Send one request for all of them
              </Link>
              <span className="mx-2 text-[var(--color-muted)]">or</span>
              <Link href="/look" className="font-semibold text-[var(--color-pink-deep)] underline underline-offset-4">
                search with a photo of a look you love
              </Link>
            </p>
          </div>
          <div className="relative hidden md:block">
            <Image
              src="/brand/hero.png"
              alt="A bride on her wedding day"
              width={1134}
              height={1387}
              priority
              className="ml-auto h-[460px] w-auto rounded-[28px] object-cover"
              sizes="(min-width: 768px) 40vw, 0px"
            />
            <div className="absolute -left-4 bottom-8 rounded-2xl border border-white bg-white/95 px-4 py-3 text-sm shadow-sm">
              <span className="flex items-center gap-2 font-semibold">
                <IconShield size={18} className="text-[var(--color-pink)]" />
                Every enquiry verified on a call
              </span>
              <span className="text-[var(--color-muted)]">before any vendor sees it</span>
            </div>
          </div>
        </Container>
      </section>

      <Container className="mt-8">
        <h2 className="text-xl font-semibold">What are you looking for?</h2>
        <ul className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(110px,1fr))] sm:px-0">
          {cats.map((c) => (
            <li key={c.slug} className="w-24 shrink-0 sm:w-auto">
              <Link href={`/vendors/${home?.slug}/${c.slug}`} className="group flex flex-col items-center gap-2 text-center text-sm">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-pink-soft)] text-[var(--color-pink-deep)] transition-colors group-hover:bg-[var(--color-pink)] group-hover:text-white">
                  <CategoryIcon slug={c.slug} />
                </span>
                {c.plural_name}
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      {banners.length ? (
        <Container className="mt-10">
          <BannerStrip banners={banners} />
        </Container>
      ) : null}

      {promoted.length ? (
        <Container className="mt-12">
          <h2 className="text-xl font-semibold">Sponsored vendors</h2>
          <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {promoted.map((v, i) => (
              <li key={v.boost_id} className="w-72 shrink-0 snap-start">
                <VendorCard v={v} fields={promotedFields[i]} backPath="/" shortlisted={hearts.has(v.id)} sponsored={{ boostId: v.boost_id, placement: 'home' }} />
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {rows.map(({ c, fields, vendors }) =>
        vendors.length ? (
          <Container key={c.slug} className="mt-12">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {c.plural_name} in {home?.name}
              </h2>
              <Link href={`/vendors/${home?.slug}/${c.slug}`} className="whitespace-nowrap text-sm font-semibold text-[var(--color-pink-deep)]">
                See all
              </Link>
            </div>
            <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
              {vendors.map((v) => (
                <li key={v.id} className="w-72 shrink-0 snap-start">
                  <VendorCard v={v} fields={fields} backPath="/" shortlisted={hearts.has(v.id)} />
                </li>
              ))}
            </ul>
          </Container>
        ) : null
      )}

      <section className="mt-14 bg-[var(--color-ink)] text-white">
        <Container className="grid gap-8 py-10 md:grid-cols-3">
          {[
            { icon: <IconShield size={26} />, t: 'Checked before they reach you', d: 'Our team calls you to confirm your date, city and budget. Only then do vendors see your request.' },
            { icon: <IconPhoneOff size={26} />, t: 'Your number stays private', d: 'Vendors message you on OLReady first. You choose when to share your phone.' },
            { icon: <IconChat size={26} />, t: 'Every quote in one place', d: 'Chat, compare and accept quotes for makeup, photography, decor, mehendi and music side by side.' },
          ].map((x) => (
            <div key={x.t}>
              <span className="text-[var(--color-pink)]">{x.icon}</span>
              <h3 className="mt-3 text-lg font-semibold">{x.t}</h3>
              <p className="mt-1 text-sm text-white/70">{x.d}</p>
            </div>
          ))}
        </Container>
      </section>

      {weddings.length ? (
        <Container className="mt-12">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold">Real weddings</h2>
            <Link href="/real-weddings" className="whitespace-nowrap text-sm font-semibold text-[var(--color-pink-deep)]">
              See all
            </Link>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {weddings.map((w) => (
              <Link key={w.id} href={`/real-weddings/${w.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden rounded-[14px]">
                  <Cover url={w.cover_image_url} name={w.couple_names} />
                </div>
                <p className="mt-2 font-semibold group-hover:text-[var(--color-pink-deep)]">{w.couple_names}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  {w.title}
                  {w.city_name ? `, ${w.city_name}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      ) : null}

      <Container className="mt-12">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[var(--color-pink-soft)] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Run a wedding business?</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">List free. Pay only for verified brides you choose to talk to.</p>
          </div>
          <Link href="/vendor/onboard" className="btn">
            List your business
          </Link>
        </div>
      </Container>
    </>
  );
}
