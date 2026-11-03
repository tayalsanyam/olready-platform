import Link from 'next/link';
import type { Banner } from '@/lib/promotion';

/** Monthly banners (home or a city page). Always labelled Sponsored. */
export function BannerStrip({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Sponsored">
      <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
        {banners.map((b) => {
          const external = b.link_url.startsWith('http');
          const body = (
            <>
              <span className="relative block aspect-video overflow-hidden rounded-[14px] bg-[var(--color-tint)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs">Sponsored</span>
              </span>
              <span className="mt-2 block font-semibold leading-snug group-hover:text-[var(--color-pink-deep)]">{b.headline}</span>
              {b.vendor_name ? <span className="text-sm text-[var(--color-muted)]">{b.vendor_name}</span> : null}
            </>
          );
          return (
            <li key={b.id} className="w-[85%] shrink-0 snap-start sm:w-[calc(33.333%-0.7rem)]">
              {external ? (
                <a href={b.link_url} rel="sponsored noopener" target="_blank" className="group block">
                  {body}
                </a>
              ) : (
                <Link href={b.link_url} rel="sponsored" className="group block">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
