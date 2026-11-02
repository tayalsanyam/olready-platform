import Link from 'next/link';
import { type CategoryField, displayValue, formatInr } from '@/lib/catalog';
import type { VendorCard as VC } from '@/lib/vendors';
import { Badge, Cover, Stars } from './ui';

export function VendorCard({ v, fields }: { v: VC; fields: CategoryField[] }) {
  const facts = fields
    .filter((f) => f.on_card)
    .map((f) => {
      const shown = displayValue(f, v.attributes[f.key]);
      if (shown == null) return null;
      if (f.type === 'bool') return v.attributes[f.key] ? f.label : null;
      return shown;
    })
    .filter(Boolean)
    .slice(0, 3) as string[];
  return (
    <Link href={`/v/${v.slug}`} className="card group block overflow-hidden transition hover:shadow-md">
      <div className="aspect-[4/3] overflow-hidden">
        <Cover url={v.cover_image_url} name={v.business_name} className="transition group-hover:scale-[1.02]" />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug">{v.business_name}</h3>
          <Stars value={v.review_count ? v.rating : null} />
        </div>
        <p className="text-sm text-[var(--color-muted)]">{v.city_name}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {v.assured ? <Badge tone="gold">Assured</Badge> : null}
          {v.verified_at ? <Badge tone="ok">Verified</Badge> : null}
          {facts.map((f) => (
            <Badge key={f}>{f}</Badge>
          ))}
        </div>
        <p className="mt-2 text-sm">
          {v.starting_price_inr != null ? (
            <>
              <span className="font-semibold">{formatInr(v.starting_price_inr)}</span>{' '}
              <span className="text-[var(--color-muted)]">{v.price_unit}</span>
            </>
          ) : (
            <span className="text-[var(--color-muted)]">Price on request</span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  // JSON-LD is built from our own data; escape "<" so no value can close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
