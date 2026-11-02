import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { displayValue, fieldsFor, formatInr } from '@/lib/catalog';
import { getVendorBySlug, publicVendor, vendorFaq, vendorMedia } from '@/lib/vendors';
import { reviewsForVendor } from '@/lib/reviews';
import { realWeddingsForVendor } from '@/lib/realWeddings';
import { breadcrumbLd, faqLd, vendorLd } from '@/lib/seo';
import { shortlistAction } from '@/lib/actions/public';
import { Badge, Container, Cover, Notice, Stars } from '@/components/ui';
import { JsonLd } from '@/components/VendorCard';

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

export default async function VendorPage({ params, searchParams }: P) {
  const { slug } = await params;
  const q = await searchParams;
  const raw = await getVendorBySlug(sql, slug);
  if (!raw) notFound();
  const viewer = await currentProfile();
  const isOwner = viewer && raw.owner_profile_id === viewer.id;
  const isStaff = viewer && STAFF_ROLES.includes(viewer.role);
  if (raw.status !== 'live' && !isOwner && !isStaff) notFound();
  // Contact details never reach the bride's browser.
  const v = publicVendor(raw);
  const [fields, media, reviews, weddings] = await Promise.all([
    fieldsFor(sql, v.category_id),
    vendorMedia(sql, v.id),
    reviewsForVendor(sql, v.id),
    realWeddingsForVendor(sql, v.id),
  ]);
  const faq = vendorFaq(raw, fields);
  const avg = (k: 'rating_artist' | 'rating_service') =>
    reviews.length ? reviews.reduce((a, r) => a + r[k], 0) / reviews.length : null;
  return (
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
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-gold-soft)] px-3 py-2 text-sm">
          Preview: this profile is <b>{raw.status.replace('_', ' ')}</b> and not visible to brides yet.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="card overflow-hidden">
          <div className="aspect-[16/10]">
            <Cover url={v.cover_image_url} name={v.business_name} />
          </div>
        </div>
        <div>
          <p className="text-sm text-[var(--color-muted)]">
            <Link href={`/vendors/${v.city_slug}/${v.category_slug}`}>{v.category_name}</Link> · {v.city_name}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">{v.business_name}</h1>
          {v.tagline ? <p className="mt-1 text-[var(--color-muted)]">{v.tagline}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {v.assured ? <Badge tone="gold">Assured</Badge> : null}
            {v.verified_at ? <Badge tone="ok">Verified by OLReady</Badge> : null}
            {v.review_count ? (
              <span className="text-sm">
                <Stars value={v.rating} /> · {v.review_count} review{v.review_count > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-lg">
            {v.starting_price_inr != null ? (
              <>
                From <b>{formatInr(v.starting_price_inr)}</b> <span className="text-[var(--color-muted)]">{v.price_unit}</span>
              </>
            ) : (
              'Price on request'
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/enquire?vendor=${v.slug}`} className="btn btn-gold">
              Request a quote
            </Link>
            <form action={shortlistAction}>
              <input type="hidden" name="slug" value={v.slug} />
              <button className="btn btn-ghost">Shortlist</button>
            </form>
          </div>
          <p className="hint mt-2">Your number stays private. {v.business_name} replies through OLReady after we verify your request.</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            {fields.map((f) => {
              const shown = displayValue(f, v.attributes[f.key]);
              if (shown == null) return null;
              return (
                <div key={f.key}>
                  <dt className="text-[var(--color-muted)]">{f.label}</dt>
                  <dd className="font-semibold">{shown}</dd>
                </div>
              );
            })}
            {v.years_experience ? (
              <div>
                <dt className="text-[var(--color-muted)]">Experience</dt>
                <dd className="font-semibold">{v.years_experience} years</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {v.about ? (
        <section className="mt-8 max-w-3xl">
          <h2 className="font-[family-name:var(--font-display)] text-xl">About</h2>
          <p className="mt-2 whitespace-pre-line">{v.about}</p>
        </section>
      ) : null}

      {media.length ? (
        <section className="mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Work</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {media.map((m) => (
              <figure key={m.id} className="aspect-square overflow-hidden rounded-lg bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.caption || `${v.business_name} work`} className="h-full w-full object-cover" loading="lazy" />
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {weddings.length ? (
        <section className="mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Real weddings</h2>
          <ul className="mt-2 space-y-1">
            {weddings.map((w) => (
              <li key={w.id}>
                <Link href={`/real-weddings/${w.slug}`} className="underline underline-offset-4">
                  {w.couple_names}: {w.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">Reviews</h2>
          {reviews.length ? (
            <>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Artist {avg('rating_artist')!.toFixed(1)} · Service {avg('rating_service')!.toFixed(1)}
              </p>
              <ul className="mt-3 space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex items-center justify-between text-sm">
                      <b>{r.author_name || 'A bride'}</b>
                      {r.verified_booking ? <Badge tone="ok">Booked via OLReady</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm">
                      Artist {r.rating_artist}/5 · Service {r.rating_service}/5
                    </p>
                    {r.body ? <p className="mt-2 text-sm">{r.body}</p> : null}
                    {r.vendor_reply ? (
                      <p className="mt-2 border-l-2 border-[var(--color-gold)] pl-3 text-sm text-[var(--color-muted)]">
                        <b>Reply:</b> {r.vendor_reply}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-muted)]">No reviews yet.</p>
          )}
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">Questions</h2>
          <dl className="mt-3 space-y-3">
            {faq.map((f) => (
              <div key={f.q} className="card p-4">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 text-sm text-[var(--color-muted)]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </Container>
  );
}
