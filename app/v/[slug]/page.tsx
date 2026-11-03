import Link from 'next/link';
import { after } from 'next/server';
import { recordView, visitorKey } from '@/lib/analytics';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { displayValue, fieldsFor, formatInr } from '@/lib/catalog';
import { getVendorBySlug, publicVendor, recentDemand, similarVendors, vendorFaq, vendorMedia } from '@/lib/vendors';
import { SPACE_KINDS, spacesFor } from '@/lib/venueSpaces';
import { JsonLd, VendorCard } from '@/components/VendorCard';
import { sponsored } from '@/lib/promotion';
import { reviewsForVendor } from '@/lib/reviews';
import { realWeddingsForVendor } from '@/lib/realWeddings';
import { shortlistedIds } from '@/lib/weddings';
import { breadcrumbLd, faqLd, vendorLd } from '@/lib/seo';
import { shortlistAction } from '@/lib/actions/public';
import { Badge, Container, Cover, Notice, Stars } from '@/components/ui';
import { IconHeart, IconPhoneOff, IconPin, IconShield } from '@/components/icons';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: P) {
  const v = await getVendorBySlug(sql, (await params).slug);
  if (!v) return { title: 'Not found', robots: { index: false } };
  return {
    title: `${v.business_name}, ${v.category_name.toLowerCase()} in ${v.city_name}`,
    description:
      v.tagline ||
      `${v.business_name} is a ${v.category_name.toLowerCase()} in ${v.city_name}${v.starting_price_inr != null ? `, from ${formatInr(v.starting_price_inr)} ${v.price_unit}` : ''}. See work, reviews and get a quote on OLReady.`,
    alternates: { canonical: `/v/${v.slug}` },
    robots: v.status === 'live' ? undefined : { index: false },
    openGraph: v.cover_image_url ? { images: [v.cover_image_url] } : undefined,
  };
}

function ShortlistButton({ slug, on, compact = false }: { slug: string; on: boolean; compact?: boolean }) {
  return (
    <form action={shortlistAction} className={compact ? '' : 'flex-1'}>
      <input type="hidden" name="slug" value={slug} />
      <button
        aria-pressed={on}
        aria-label={compact ? (on ? 'Shortlisted' : 'Shortlist') : undefined}
        className={`btn btn-ghost ${compact ? 'h-12 w-12 !px-0' : 'w-full'} ${on ? 'text-[var(--color-pink)]' : ''}`}
      >
        <IconHeart size={18} filled={on} />
        {compact ? null : on ? 'Shortlisted' : 'Shortlist'}
      </button>
    </form>
  );
}

export default async function VendorPage({ params, searchParams }: P) {
  const { slug } = await params;
  const q = await searchParams;
  const raw = await getVendorBySlug(sql, slug);
  if (!raw) notFound();
  const viewer = await currentProfile();
  const isOwner = viewer && raw.owner_profile_id === viewer.id;
  const isStaff = viewer && STAFF_ROLES.includes(viewer.role);
  if (raw.status !== 'live' && !isOwner && !isStaff) notFound();
  if (raw.status === 'live' && !isOwner && !isStaff) {
    const visitor = await visitorKey();
    after(() => recordView(sql, raw.id, visitor).catch(() => undefined));
  }
  // Contact details never reach the bride's browser.
  const v = publicVendor(raw);
  const [fields, media, allReviews, weddings, hearts, spaces, similar, demand] = await Promise.all([
    fieldsFor(sql, v.category_id),
    vendorMedia(sql, v.id),
    reviewsForVendor(sql, v.id),
    realWeddingsForVendor(sql, v.id),
    shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null),
    v.category_slug === 'venues' ? spacesFor(sql, v.id) : Promise.resolve([]),
    similarVendors(sql, v),
    recentDemand(sql, v.id),
  ]);
  // Review filters: all, with photos, positive (4 and above), critical (2 and below).
  const overall = (r: { rating_artist: number; rating_service: number }) => (r.rating_artist + r.rating_service) / 2;
  const rf = ['photos', 'positive', 'critical'].includes(String(q.reviews)) ? String(q.reviews) : 'all';
  const reviews = allReviews.filter((r) =>
    rf === 'photos' ? r.photos?.length : rf === 'positive' ? overall(r) >= 4 : rf === 'critical' ? overall(r) <= 2 : true
  );
  const hist = [5, 4, 3, 2, 1].map((s) => ({ s, n: allReviews.filter((r) => Math.round(overall(r)) === s).length }));
  const word = (x: number) => (x >= 4.7 ? 'Superb' : x >= 4.3 ? 'Excellent' : x >= 3.8 ? 'Very good' : x >= 3 ? 'Good' : 'Mixed');
  const on = hearts.has(v.id);
  const faq = vendorFaq(raw, fields);
  const avg = (k: 'rating_artist' | 'rating_service') =>
    allReviews.length ? allReviews.reduce((a, r) => a + r[k], 0) / allReviews.length : null;
  const facts = fields
    .map((f) => ({ label: f.label, shown: displayValue(f, v.attributes[f.key]) }))
    .filter((f): f is { label: string; shown: string } => f.shown != null);
  if (v.years_experience) facts.push({ label: 'Experience', shown: `${v.years_experience} years` });
  // Gallery: cover first, then up to four portfolio photos.
  const side = media.filter((m) => m.url !== v.cover_image_url).slice(0, 4);
  const quoteHref = `/enquire?vendor=${v.slug}`;
  const price =
    v.starting_price_inr != null ? (
      <p className="flex items-baseline gap-1.5">
        <span className="figure text-3xl">{formatInr(v.starting_price_inr)}</span>
        <span className="text-sm text-[var(--color-muted)]">onwards, {v.price_unit}</span>
      </p>
    ) : (
      <p className="text-lg font-semibold">Price on request</p>
    );

  return (
    <>
      <Container>
        <JsonLd
          data={[
            vendorLd(raw),
            faqLd(faq),
            breadcrumbLd([
              { name: v.city_name, path: `/vendors/${v.city_slug}` },
              { name: v.category_name, path: `/vendors/${v.city_slug}/${v.category_slug}` },
              { name: v.business_name, path: `/v/${v.slug}` },
            ]),
          ]}
        />
        <Notice error={q.error} ok={q.ok} />
        {raw.status !== 'live' ? (
          <div className="mb-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-pink-soft)] px-3 py-2 text-sm">
            Preview: this profile is <b>{raw.status.replace('_', ' ')}</b> and not visible to brides yet.
          </div>
        ) : null}
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
          <Link href={`/vendors/${v.city_slug}`}>{v.city_name}</Link> /{' '}
          <Link href={`/vendors/${v.city_slug}/${v.category_slug}`}>{v.category_name}</Link>
        </nav>

        <div
          className={`grid gap-2 overflow-hidden rounded-[18px] ${side.length >= 2 ? 'md:h-[420px] md:grid-cols-4 md:grid-rows-2' : ''}`}
        >
          <div className={`relative aspect-[4/3] md:aspect-auto ${side.length >= 2 ? 'md:col-span-2 md:row-span-2' : 'md:h-[420px]'}`}>
            <Cover url={v.cover_image_url} name={v.business_name} />
            {media.length ? (
              <a
                href="#work"
                className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold md:hidden"
              >
                {media.length} photo{media.length > 1 ? 's' : ''}
              </a>
            ) : null}
          </div>
          {side.length >= 2
            ? side.map((m, i) => (
                <div key={m.id} className={`relative hidden md:block ${side.length === 2 ? 'md:col-span-2' : side.length === 3 && i === 0 ? 'md:row-span-2' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption || `${v.business_name} work`} className="h-full w-full object-cover" />
                  {i === side.length - 1 && media.length > side.length ? (
                    <a href="#work" className="absolute inset-0 flex items-center justify-center bg-black/40 font-semibold text-white">
                      See all {media.length} photos
                    </a>
                  ) : null}
                </div>
              ))
            : null}
        </div>

        <div className="mt-6 grid gap-10 md:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {v.assured ? (
                <Badge tone="gold">
                  <span className="inline-flex items-center gap-1">
                    <IconShield size={14} /> Assured
                  </span>
                </Badge>
              ) : null}
              {v.verified_at ? <Badge tone="ok">Verified by OLReady</Badge> : null}
            </div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">{v.business_name}</h1>
            {v.tagline ? <p className="mt-1 text-[var(--color-muted)]">{v.tagline}</p> : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
              <span className="inline-flex items-center gap-1">
                <IconPin size={14} />
                {v.city_name}
              </span>
              {v.review_count ? <Stars value={v.rating} count={v.review_count} /> : null}
            </p>
            {demand >= 3 ? (
              <p className="mt-2 inline-flex rounded-full bg-[var(--color-pink-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-pink-deep)]">
                {demand} families asked about {v.business_name} in the last 7 days
              </p>
            ) : null}
            <div className="mt-4 md:hidden">{price}</div>

            {facts.length ? (
              <dl className="mt-6 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-[12px] bg-[var(--color-tint)] p-3">
                    <dt className="text-[var(--color-muted)]">{f.label}</dt>
                    <dd className="mt-0.5 font-semibold">{f.shown}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {spaces.length ? (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">Halls and lawns</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {spaces.map((sp) => (
                    <li key={sp.id} className="rounded-[12px] border border-[var(--color-line)] p-3 text-sm">
                      <p className="font-semibold">{sp.name}</p>
                      <p className="text-[var(--color-muted)]">{SPACE_KINDS[sp.kind]}</p>
                      <p className="mt-1">
                        {sp.seating ? (
                          <>
                            <span className="figure text-lg">{sp.seating}</span> seated
                          </>
                        ) : null}
                        {sp.seating && sp.floating ? <span className="text-[var(--color-muted)]"> · </span> : null}
                        {sp.floating ? (
                          <>
                            <span className="figure text-lg">{sp.floating}</span> floating
                          </>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {v.about ? (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">About</h2>
                <p className="mt-2 max-w-[68ch] whitespace-pre-line">{v.about}</p>
              </section>
            ) : null}

            {media.length ? (
              <section id="work" className="mt-8 scroll-mt-32">
                <h2 className="text-xl font-semibold">Work</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {media.map((m) => (
                    <figure key={m.id} className="aspect-square overflow-hidden rounded-[10px] bg-[var(--color-tint)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.caption || `${v.business_name} work`} className="h-full w-full object-cover" loading="lazy" />
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}

            {weddings.length ? (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">Real weddings</h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {weddings.map((w) => (
                    <li key={w.id}>
                      <Link href={`/real-weddings/${w.slug}`} className="group flex items-center gap-3">
                        <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-[10px]">
                          <Cover url={w.cover_image_url} name={w.couple_names} />
                        </span>
                        <span>
                          <span className="block font-semibold group-hover:text-[var(--color-pink-deep)]">{w.couple_names}</span>
                          <span className="text-sm text-[var(--color-muted)]">{w.title}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section id="reviews" className="mt-8 scroll-mt-32">
              <h2 className="text-xl font-semibold">Reviews</h2>
              {allReviews.length ? (
                <>
                  <div className="mt-3 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                    <div>
                      <span className="figure text-5xl">{v.rating?.toFixed(1)}</span>
                      <p className="font-semibold">{word(v.rating ?? 0)}</p>
                      <p className="text-sm text-[var(--color-muted)]">
                        Work {avg('rating_artist')!.toFixed(1)}, service {avg('rating_service')!.toFixed(1)}
                        <br />
                        from {allReviews.length} review{allReviews.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <ul className="space-y-1 text-sm" aria-label="Rating breakdown">
                      {hist.map((h) => (
                        <li key={h.s} className="flex items-center gap-2">
                          <span className="w-6">{h.s}★</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-tint)]">
                            <span className="block h-full rounded-full bg-[var(--color-pink)]" style={{ width: `${(100 * h.n) / allReviews.length}%` }} />
                          </span>
                          <span className="w-6 text-right text-[var(--color-muted)]">{h.n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show reviews">
                    {(
                      [
                        ['all', 'All'],
                        ['photos', 'With photos'],
                        ['positive', 'Positive'],
                        ['critical', 'Critical'],
                      ] as const
                    ).map(([k, label]) => (
                      <Link key={k} href={`/v/${v.slug}${k === 'all' ? '' : `?reviews=${k}`}#reviews`} scroll={false} className="chip" aria-current={rf === k} rel="nofollow">
                        {label}
                        {k === 'photos' ? ` (${allReviews.filter((r) => r.photos?.length).length})` : k === 'positive' ? ` (${allReviews.filter((r) => overall(r) >= 4).length})` : k === 'critical' ? ` (${allReviews.filter((r) => overall(r) <= 2).length})` : ''}
                      </Link>
                    ))}
                  </div>
                  {!reviews.length ? <p className="mt-3 text-sm text-[var(--color-muted)]">No reviews match.</p> : null}
                  <ul className="mt-4 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
                    {reviews.map((r) => (
                      <li key={r.id} className="py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <b>{r.author_name || 'A bride'}</b>
                          {r.verified_booking ? <Badge tone="ok">Booked via OLReady</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-muted)]">
                          Work {r.rating_artist}/5, service {r.rating_service}/5
                          {r.function_date ? `, function on ${new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(r.function_date))}` : ''}
                          {r.amount_spent_inr ? `, spent about ${formatInr(r.amount_spent_inr)}` : ''}
                        </p>
                        {r.body ? <p className="mt-2 max-w-[68ch] text-sm">{r.body}</p> : null}
                        {r.photos?.length ? (
                          <div className="mt-2 flex gap-2">
                            {r.photos.map((u) => (
                              <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-[8px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="Review photo" className="h-full w-full object-cover" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {r.vendor_reply ? (
                          <p className="mt-2 border-l-2 border-[var(--color-pink)] pl-3 text-sm text-[var(--color-muted)]">
                            <b>Reply:</b> {r.vendor_reply}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--color-muted)]">No reviews yet. Brides who book through OLReady can leave one.</p>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Questions</h2>
              <dl className="mt-3 border-t border-[var(--color-line)]">
                {faq.map((f) => (
                  <div key={f.q} className="border-b border-[var(--color-line)] py-3">
                    <dt className="font-semibold">{f.q}</dt>
                    <dd className="mt-1 text-sm text-[var(--color-muted)]">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {await (async () => {
            const promoted = await sponsored(sql, { categoryId: v.category_id, cityId: v.city_id, placement: 'profiles', exclude: [v.id, ...similar.map((x) => x.id)], limit: 2 });
            return promoted.length ? (
              <section className="md:col-span-2" aria-label="Sponsored">
                <div className="grid gap-5 rounded-[18px] bg-[var(--color-tint)] p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {promoted.map((x) => (
                    <VendorCard key={x.boost_id} v={x} fields={fields} backPath={`/v/${v.slug}`} shortlisted={hearts.has(x.id)} sponsored={{ boostId: x.boost_id, placement: 'profiles' }} />
                  ))}
                </div>
              </section>
            ) : null;
          })()}
          {similar.length ? (
            <section className="md:col-span-2">
              <h2 className="text-xl font-semibold">Similar {v.category_name.toLowerCase()}s</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {similar.map((x) => (
                  <VendorCard key={x.id} v={x} fields={fields} backPath={`/v/${v.slug}`} shortlisted={hearts.has(x.id)} />
                ))}
              </div>
            </section>
          ) : null}

          <aside className="hidden md:col-start-2 md:row-start-1 md:block">
            <div className="sticky top-20 rounded-[18px] border border-[var(--color-line)] p-5">
              {price}
              <Link href={quoteHref} className="btn btn-pink mt-4 w-full">
                Request a quote
              </Link>
              <div className="mt-2 flex">
                <ShortlistButton slug={v.slug} on={on} />
              </div>
              <p className="mt-4 flex gap-2 text-sm text-[var(--color-muted)]">
                <IconPhoneOff size={18} className="mt-0.5 shrink-0" />
                Your number stays private. {v.business_name} replies through OLReady after our team verifies your request.
              </p>
            </div>
          </aside>
        </div>
      </Container>

      <div data-cta-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Link href={quoteHref} className="btn btn-pink h-12 flex-1">
            Request a quote
          </Link>
          <ShortlistButton slug={v.slug} on={on} compact />
        </div>
      </div>
    </>
  );
}
