import Image from 'next/image';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { fieldsFor, listCategories, listCities } from '@/lib/catalog';
import { rememberedTown } from '@/lib/town';
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
import { Toran } from '@/components/Toran';
import { InviteCard } from '@/components/InviteCard';
import { inviteDesigns } from '@/lib/invites';
import { SAMPLE } from '@/lib/inviteDesign';
import { ideaPhotos } from '@/lib/ideas';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [cats, cities, weddings, viewer] = await Promise.all([
    listCategories(sql, { activeOnly: true }),
    listCities(sql),
    publishedRealWeddings(sql, 3),
    currentProfile(),
  ]);
  // The remembered town leads the town picker, even when it is not in the short list.
  const remembered = await rememberedTown(sql);
  if (remembered && !cities.some((c) => c.id === remembered.id)) cities.unshift(remembered);
  const home = remembered ?? cities[0];
  const hearts = await shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null);
  // One row of vendors per category, for the city most brides plan in.
  const rows = await Promise.all(
    cats.slice(0, 3).map(async (c) => ({
      c,
      fields: await fieldsFor(sql, c.id),
      vendors: await browseVendors(sql, { categoryId: c.id, cityId: home?.id, limit: 8 }),
    }))
  );
  const [banners, promoted, designs, photos, [reach], popular] = await Promise.all([
    liveBanners(sql, 'home'),
    sponsored(sql, { cityId: home?.id, placement: 'home', limit: 4 }),
    inviteDesigns(sql, { kind: 'card' }),
    ideaPhotos(sql, { limit: 4 }),
    sql<{ vendors: number; towns: number }[]>`
      select count(*)::int as vendors, count(distinct city_id)::int as towns from mkt.vendors where status = 'live'`,
    // Quick searches people make most: the busiest category in each town that has vendors.
    sql<{ city_slug: string; city: string; cat_slug: string; cat: string }[]>`
      select distinct on (ci.id) ci.slug as city_slug, ci.name as city, c.slug as cat_slug, c.plural_name as cat
      from mkt.vendors v join mkt.cities ci on ci.id = v.city_id join mkt.categories c on c.id = v.category_id and c.active
      where v.status = 'live'
      group by ci.id, ci.slug, ci.name, ci.sort, c.slug, c.plural_name, c.sort
      order by ci.id, count(*) desc, c.sort limit 6`,
  ]);
  const invite = designs[0];
  const promotedFields = await Promise.all(promoted.map((v) => fieldsFor(sql, v.category_id)));
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Olready',
            url: siteUrl(),
            potentialAction: { '@type': 'SearchAction', target: `${siteUrl()}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
          },
          { '@context': 'https://schema.org', '@type': 'Organization', name: 'Olready', url: siteUrl(), logo: `${siteUrl()}/icon.png` },
        ]}
      />
      <section className="-mt-6 bg-[var(--color-tint)]">
        <Toran />
        <Container className="grid items-center gap-8 pb-8 pt-2 md:grid-cols-[1.1fr_1fr] md:pb-12 md:pt-4">
          <div>
            <h1 className="max-w-xl text-4xl leading-[1.08] sm:text-5xl">Plan your wedding with vendors we have checked first.</h1>
            <p className="mt-4 max-w-lg text-lg text-[var(--color-muted)]">
              Venues, caterers, makeup, photography, decor and more, in towns across India. Tell us once; our
              team confirms your details, then verified vendors send you quotes.
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
            {popular.length ? (
              <div className="mt-4">
                <p className="text-sm text-[var(--color-muted)]">Brides are looking at</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {popular.map((p) => (
                    <li key={p.city_slug}>
                      <Link href={`/vendors/${p.city_slug}/${p.cat_slug}`} className="chip bg-white">
                        {p.cat} in {p.city}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-4 text-sm">
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
              <span className="text-[var(--color-muted)]">
                before any of our {reach.vendors} checked vendors in {reach.towns} towns sees it
              </span>
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
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-pink-soft)] text-[var(--color-pink-deep)] transition-[background,color,transform] duration-200 group-hover:-translate-y-1 group-hover:bg-[var(--color-pink)] group-hover:text-white group-hover:shadow-[0_10px_22px_-10px_rgb(226_0_94/.7)]">
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
        <Container className="reveal mt-12">
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
          <Container key={c.slug} className="reveal mt-12">
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

      <section className="jaali-dark mt-14 bg-[var(--color-ink)] text-white">
        <Container className="reveal py-10 md:py-14">
          <h2 className="max-w-xl text-2xl font-semibold leading-tight md:text-3xl">One request, one short call, then quotes from vendors who want your wedding.</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              { icon: <IconChat size={22} />, t: 'Tell us once', d: 'Tick every vendor you still need: venue, caterer, makeup, photos, decor. One form, not ten.' },
              { icon: <IconShield size={22} />, t: 'We call to check', d: 'A real person from our team confirms your date, city and budget. Only then do vendors see your request.' },
              { icon: <IconPhoneOff size={22} />, t: 'Compare and choose', d: 'Verified vendors message and quote you on Olready. Your number stays private until you share it.' },
            ].map((x, i) => (
              <li key={x.t} className="relative border-t border-white/20 pt-5">
                <span className="figure absolute -top-[0.9rem] left-0 bg-[var(--color-ink)] pr-3 text-2xl text-[var(--color-pink)]">{i + 1}</span>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <span className="text-[var(--color-pink)]">{x.icon}</span>
                  {x.t}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{x.d}</p>
              </li>
            ))}
          </ol>
          <Link href="/enquire" className="btn btn-pink mt-8">
            Send one request
          </Link>
        </Container>
      </section>

      <Container className="reveal mt-14">
        <h2 className="text-xl font-semibold">Plan the rest of it here too</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Free with your Olready account.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.15fr] md:grid-rows-2">
          {invite ? (
            <Link href="/invitations" className="group relative overflow-hidden rounded-[22px] bg-[var(--color-pink-soft)] p-5 md:row-span-2">
              <p className="font-semibold group-hover:text-[var(--color-pink-deep)]">E-invites your family will forward</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Pick a design, add your functions, share on WhatsApp. Guests reply on their own RSVP link.</p>
              <div className="mx-auto mt-5 w-full max-w-[260px] rotate-[-2.5deg] transition-transform duration-300 group-hover:rotate-0">
                <InviteCard layout={invite.layout} theme={invite.theme} content={{ ...SAMPLE, kind: 'card' }} compact />
              </div>
            </Link>
          ) : null}
          <Link href="/me/assistant" className="group rounded-[22px] border border-[var(--color-line)] p-5 hover:border-[var(--color-pink)]">
            <p className="font-semibold group-hover:text-[var(--color-pink-deep)]">Ask Olready, in your own words</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-pink-soft)] px-3 py-2">Venue in Zirakpur for 400 guests, under ₹1,500 a plate?</p>
              <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-[var(--color-tint)] px-3 py-2">I found three that fit. Want me to shortlist them and ask for quotes?</p>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">Answers come from real Olready listings. English, Hindi or Hinglish.</p>
          </Link>
          <Link href="/ideas" className="group grid grid-cols-[1fr_auto] items-center gap-4 rounded-[22px] border border-[var(--color-line)] p-5 hover:border-[var(--color-pink)]">
            <div>
              <p className="font-semibold group-hover:text-[var(--color-pink-deep)]">Ideas from real weddings</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Looks, mehendi, decor and outfits from real vendors. Save the ones you love to your wedding wall.</p>
            </div>
            {photos.length ? (
              <div className="grid h-24 w-24 grid-cols-2 gap-1 overflow-hidden rounded-xl sm:h-28 sm:w-28">
                {photos.slice(0, 4).map((p) => (
                  <div key={p.ref} className="overflow-hidden bg-[var(--color-tint)]">
                    <Cover url={p.url} name={p.caption || p.topic_name} />
                  </div>
                ))}
              </div>
            ) : null}
          </Link>
        </div>
      </Container>

      {weddings.length ? (
        <Container className="reveal mt-12">
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
                  {w.city_name && !w.title.includes(w.city_name) ? `, ${w.city_name}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      ) : null}

      <Container className="reveal mt-12">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[var(--color-pink-soft)] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Run a wedding business?</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">List free. Pay only for verified brides you choose to talk to.</p>
          </div>
          <Link href="/for-vendors" className="btn">
            See how it works for vendors
          </Link>
        </div>
      </Container>
    </>
  );
}
