import Link from 'next/link';
import { type CategoryField, displayValue, formatInr } from '@/lib/catalog';
import type { VendorCard as VC } from '@/lib/vendors';
import { shortlistAction } from '@/lib/actions/public';
import { IconHeart, IconPin, IconShield } from './icons';
import { Cover, Stars } from './ui';

/**
 * Photo-first vendor card. The heart sits outside the link so it can be its own form,
 * and returns the visitor to the page they were on.
 */
export function VendorCard({
  v,
  fields,
  backPath,
  shortlisted = false,
  sponsored,
}: {
  v: VC;
  fields: CategoryField[];
  backPath?: string;
  shortlisted?: boolean;
  /** A Boost: the card links through the visit counter and says Sponsored. */
  sponsored?: { boostId: string; placement: 'search' | 'profiles' | 'home' };
}) {
  const facts = fields
    .filter((f) => f.on_card)
    .map((f) => {
      const shown = displayValue(f, v.attributes[f.key]);
      if (shown == null) return null;
      if (f.type === 'bool') return v.attributes[f.key] ? f.label : null;
      // Numbers need their label to mean anything on a card: "Up to 1,500 guests", "Non-veg ₹1,350".
      if (f.type === 'money') return `${f.label.replace(/ per plate$/i, '')} ${shown}`;
      if (f.type === 'number') {
        const n = Number(v.attributes[f.key]).toLocaleString('en-IN');
        return f.key === 'capacity_max' ? `Up to ${n} guests` : `${f.label}: ${n}`;
      }
      return shown;
    })
    .filter(Boolean)
    .slice(0, 3) as string[];
  return (
    <article className="group relative">
      <Link
        href={sponsored ? `/go/boost/${sponsored.boostId}?p=${sponsored.placement}` : `/v/${v.slug}`}
        className="block"
        prefetch={sponsored ? false : undefined}
        rel={sponsored ? 'sponsored nofollow' : undefined}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-[var(--color-tint)]">
          <Cover url={v.cover_image_url} name={v.business_name} />
          {v.assured || v.verified_at ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-[var(--color-pink-deep)]">
              <IconShield size={14} />
              {v.assured ? 'Assured' : 'Verified'}
            </span>
          ) : null}
        </div>
        <div className="pt-2.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug group-hover:text-[var(--color-pink-deep)]">
              {v.business_name}
              {sponsored ? <span className="ml-1.5 align-middle text-xs font-normal text-[var(--color-muted)]">Sponsored</span> : null}
            </h3>
            {v.review_count ? <Stars value={v.rating} /> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-[var(--color-muted)]">
            <IconPin size={14} />
            {v.city_name}
          </p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            {v.starting_price_inr != null ? (
              <>
                <span className="figure text-xl">{formatInr(v.starting_price_inr)}</span>
                <span className="text-sm text-[var(--color-muted)]">onwards, {v.price_unit}</span>
              </>
            ) : (
              <span className="text-sm text-[var(--color-muted)]">Price on request</span>
            )}
          </p>
          {facts.length ? (
            <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-[var(--color-muted)]">
              {facts.map((f) => (
                <span key={f} className="rounded-full bg-[var(--color-tint)] px-2 py-0.5">
                  {f}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </Link>
      <form action={shortlistAction} className="absolute right-2 top-2">
        <input type="hidden" name="slug" value={v.slug} />
        {backPath ? <input type="hidden" name="_back" value={backPath} /> : null}
        <button
          aria-label={shortlisted ? `Remove ${v.business_name} from shortlist` : `Shortlist ${v.business_name}`}
          aria-pressed={shortlisted}
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/95 ${shortlisted ? 'text-[var(--color-pink)]' : 'text-[var(--color-ink)]'}`}
        >
          <IconHeart size={18} filled={shortlisted} />
        </button>
      </form>
    </article>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  // JSON-LD is built from our own data; escape "<" so no value can close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
