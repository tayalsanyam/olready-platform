import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { formatInr, listCategories } from '@/lib/catalog';
import { townsWithVendors } from '@/lib/locations';
import { vendorForOwner } from '@/lib/vendors';
import { Container } from '@/components/ui';
import { Toran } from '@/components/Toran';
import { CategoryIcon, IconChat, IconPhoneOff, IconShield } from '@/components/icons';
import { JsonLd } from '@/components/VendorCard';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'List your wedding business on OLReady',
  description:
    'Get wedding enquiries from brides in your town, anywhere in India. Every request is verified on a call before you see it. List free; pay only for the leads you choose.',
  alternates: { canonical: '/for-vendors' },
};

const FAQ = [
  {
    q: 'Is listing really free?',
    a: 'Yes. Your profile, photos, reviews and your place in the city and category pages cost nothing. You only spend credits when you unlock a verified request you want to answer.',
  },
  {
    q: 'What does "verified" mean?',
    a: 'Someone from our team calls every bride before her request goes out. We confirm she is real, still looking, and her date, city and budget. Fake or wrong leads are removed and your credits come back.',
  },
  {
    q: 'Is a lead exclusive to me?',
    a: 'No. Each request is open to a small number of vendors in that category (shown on the lead) so brides can compare. Once that many have unlocked it, it closes.',
  },
  {
    q: 'Do I get the bride’s phone number?',
    a: 'You chat and quote on OLReady first. Her number appears when you unlock, and she chooses when to share more. Your own contact details are never shown publicly.',
  },
  {
    q: 'What do plans include?',
    a: 'Plans give you credits that last for the plan period, with a contract and a GST tax invoice. Top-ups add credits that never expire. Prices on this page include GST.',
  },
  {
    q: 'Can I promote my profile?',
    a: 'Yes, with Boosts and banners paid from an ads wallet. Promoted places are always labelled Sponsored and never change your position in the regular results.',
  },
];

export default async function ForVendors() {
  const p = await currentProfile();
  const mine = p ? await vendorForOwner(sql, p.id) : null;
  const [cats, cities, packs, [reach], demand] = await Promise.all([
    listCategories(sql, { activeOnly: true }),
    townsWithVendors(sql),
    sql<{ id: number; name: string; kind: 'plan' | 'topup'; credits: number; price_inr: number; validity_days: number | null; description: string }[]>`
      select id, name, kind, credits, price_inr, validity_days, description from mkt.packs where active order by sort`,
    sql<{ vendors: number; verified_90: number }[]>`
      select (select count(*)::int from mkt.vendors where status = 'live') as vendors,
             (select count(*)::int from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id
              where l.status = 'verified' and l.verified_at > now() - interval '90 days') as verified_90`,
    sql<{ slug: string; name: string; n: number }[]>`
      select c.slug, c.plural_name as name, count(ln.id)::int as n
      from mkt.categories c left join mkt.lead_needs ln on ln.category_id = c.id
        and exists (select 1 from mkt.leads l where l.id = ln.lead_id and l.status = 'verified' and l.verified_at > now() - interval '90 days')
      where c.active group by c.slug, c.plural_name, c.sort order by count(ln.id) desc, c.sort`,
  ]);
  const start = mine ? '/vendor' : p ? '/vendor/onboard' : '/login?as=vendor&next=%2Fvendor%2Fonboard';
  const startLabel = mine ? 'Go to your dashboard' : 'List your business free';
  const plans = packs.filter((x) => x.kind === 'plan');
  const topups = packs.filter((x) => x.kind === 'topup');
  const showDemand = reach.verified_90 >= 20;
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          url: `${siteUrl()}/for-vendors`,
          mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
        }}
      />
      <section className="-mt-6 bg-[var(--color-tint)]">
        <Toran />
        <Container className="grid items-center gap-10 pb-12 pt-2 md:grid-cols-[1.15fr_1fr] md:pb-16 md:pt-6">
          <div>
            <p className="text-sm font-semibold text-[var(--color-pink-deep)]">For wedding businesses across India</p>
            <h1 className="mt-2 max-w-xl text-4xl leading-[1.08] sm:text-5xl">Wedding enquiries that are real before you pay for them.</h1>
            <p className="mt-4 max-w-lg text-lg text-[var(--color-muted)]">
              Brides tell us what they need. Our team calls every one of them to check. You see the verified requests in your category and city, and
              unlock only the ones that fit.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={start} className="btn btn-pink">
                {startLabel}
              </Link>
              {!p ? (
                <Link href="/login?as=vendor&next=%2Fvendor" className="btn btn-ghost">
                  Sign in to your business
                </Link>
              ) : null}
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              {reach.vendors} businesses list with us across {cities.length} towns. Free to list, no contract to start.
            </p>
          </div>

          {/* What a verified lead looks like on the vendor dashboard. */}
          <figure className="mx-auto w-full max-w-sm">
            <div className="rotate-[1.5deg] rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[0_18px_40px_-24px_rgba(166,0,72,0.35)]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ee] px-2 py-0.5 text-xs font-semibold text-[var(--color-ok)]">
                  <IconShield size={13} /> Verified on a call
                </span>
                <span className="text-xs text-[var(--color-muted)]">2 of 6 unlocked</span>
              </div>
              <p className="mt-3 text-lg font-semibold">Ananya, wedding venue</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-[var(--color-muted)]">Where</dt>
                <dd>Zirakpur</dd>
                <dt className="text-[var(--color-muted)]">When</dt>
                <dd>14 Feb 2027</dd>
                <dt className="text-[var(--color-muted)]">Guests</dt>
                <dd>about 400</dd>
                <dt className="text-[var(--color-muted)]">Budget</dt>
                <dd>₹1,200–1,500 a plate</dd>
              </dl>
              <p className="mt-3 rounded-xl bg-[var(--color-tint)] px-3 py-2 text-xs text-[var(--color-muted)]">Also looking for a caterer, decorator and DJ</p>
              <span className="btn btn-pink mt-4 w-full">Unlock for 1 credit</span>
            </div>
            <figcaption className="mt-3 text-center text-xs text-[var(--color-muted)]">An example of a lead on your dashboard</figcaption>
          </figure>
        </Container>
      </section>

      <Container className="mt-14">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-4">
          {[
            { t: 'List free', d: 'Add your prices, photos and details. Our team checks your profile, then it goes live on your city and category pages.' },
            { t: 'Brides are verified', d: 'Every request is confirmed on a call: real person, real date, real budget. Wrong numbers never reach you.' },
            { t: 'Unlock what fits', d: 'See the date, place, guests and budget first. Spend credits only on the weddings you want.' },
            { t: 'Chat, quote, get booked', d: 'Message and send quotes on OLReady. Report the booking and get a bonus credit back.' },
          ].map((s, i) => (
            <li key={s.t}>
              <span className="figure text-3xl text-[var(--color-pink)]">{i + 1}</span>
              <h3 className="mt-1 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">{s.d}</p>
            </li>
          ))}
        </ol>
      </Container>

      <Container className="mt-14">
        <div className="grid gap-8 md:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="text-2xl font-semibold">Every kind of wedding business</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              {showDemand
                ? `Brides sent ${reach.verified_90.toLocaleString('en-IN')} verified requests across these categories in the last 90 days.`
                : 'Brides send one request for every vendor they need, so a single wedding can reach a venue, a caterer and a makeup artist at once.'}
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {demand.map((c) => (
              <li key={c.slug} className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white py-1.5 pl-1.5 pr-3 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-pink-soft)] text-[var(--color-pink-deep)] [&_svg]:h-4 [&_svg]:w-4">
                  <CategoryIcon slug={c.slug} />
                </span>
                {c.name}
                {showDemand && c.n ? <span className="text-[var(--color-muted)]">{c.n}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </Container>

      <section className="mt-14 bg-[var(--color-ink)] text-white">
        <Container className="grid gap-8 py-12 md:grid-cols-3">
          {[
            { icon: <IconShield size={24} />, t: 'Leads you can trust', d: 'Verified by a person, capped per category, and refunded if they turn out fake.' },
            { icon: <IconChat size={24} />, t: 'Tools that win bookings', d: 'Quotes brides compare side by side, review requests, a website reviews widget and weekly insights.' },
            { icon: <IconPhoneOff size={24} />, t: 'Your details stay yours', d: 'Your phone and email are never shown publicly. Brides reach you through OLReady first.' },
          ].map((x) => (
            <div key={x.t}>
              <span className="text-[var(--color-pink)]">{x.icon}</span>
              <h3 className="mt-3 text-lg font-semibold">{x.t}</h3>
              <p className="mt-1 text-sm text-white/70">{x.d}</p>
            </div>
          ))}
        </Container>
      </section>

      <Container className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold">Prices</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">GST included. A GST tax invoice is issued with every payment.</p>
        {plans.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {plans.map((x, i) => (
              <div key={x.id} className={`rounded-[22px] border p-5 ${i === 1 ? 'border-[var(--color-pink)] bg-[var(--color-pink-soft)]' : 'border-[var(--color-line)]'}`}>
                <p className="font-semibold">{x.name}</p>
                <p className="figure mt-2 text-4xl">{formatInr(x.price_inr)}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  {x.credits} credits{x.validity_days ? ` for ${Math.round(x.validity_days / 30)} months` : ''}
                </p>
                <p className="mt-3 text-sm">{x.description}</p>
              </div>
            ))}
          </div>
        ) : null}
        {topups.length ? (
          <div className="mt-6 rounded-[22px] border border-[var(--color-line)] p-5">
            <p className="font-semibold">Or top up as you go</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {topups.map((x) => (
                <li key={x.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] pb-2 sm:block sm:border-0 sm:pb-0">
                  <span>{x.name}</span>
                  <span className="figure text-2xl sm:block">{formatInr(x.price_inr)}</span>
                  <span className="text-sm text-[var(--color-muted)] sm:block">{x.credits} credits, no expiry</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Container>

      <Container className="mt-14 max-w-3xl">
        <h2 className="text-2xl font-semibold">Questions vendors ask</h2>
        <div className="mt-4 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span aria-hidden className="text-xl text-[var(--color-pink)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>

      <Container className="mt-14">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[22px] bg-[var(--color-pink-soft)] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">{mine ? 'Your business is on OLReady' : 'Ready when you are'}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {mine ? 'See your leads, conversations and insights.' : `${cats.length} categories, every town in India, one dashboard.`}
            </p>
          </div>
          <Link href={start} className="btn btn-pink">
            {startLabel}
          </Link>
        </div>
      </Container>
    </>
  );
}
