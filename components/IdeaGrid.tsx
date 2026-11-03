import Link from 'next/link';
import type { IdeaPhoto } from '@/lib/ideas';
import { saveItemAction } from '@/lib/actions/ideas';
import { IconHeart } from './icons';

/** Masonry grid of gallery photos. Each photo opens its own page; the heart saves it to the wedding wall. */
export function IdeaGrid({ photos, saved, backPath }: { photos: IdeaPhoto[]; saved: Set<string>; backPath: string }) {
  return (
    <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
      {photos.map((p) => {
        const on = saved.has(p.ref);
        const alt = p.caption || `${p.topic_name}${p.vendor_name ? ` by ${p.vendor_name}` : ''}`;
        return (
          <li key={p.ref} className="relative mb-3 break-inside-avoid">
            <Link href={`/ideas/photo/${p.ref}`} className="group block overflow-hidden rounded-[12px] bg-[var(--color-tint)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={alt} loading="lazy" className="w-full transition-transform duration-300 group-hover:scale-[1.02]" />
            </Link>
            {p.vendor_name ? (
              <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                {p.rw_names ? `${p.rw_names}, ` : ''}
                {p.vendor_name}
              </p>
            ) : p.rw_names ? (
              <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{p.rw_names}</p>
            ) : null}
            <form action={saveItemAction} className="absolute right-2 top-2">
              <input type="hidden" name="kind" value="photo" />
              <input type="hidden" name="ref" value={p.ref} />
              <input type="hidden" name="_back" value={backPath} />
              <button
                aria-label={on ? 'Remove from wedding wall' : 'Save to wedding wall'}
                aria-pressed={on}
                className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/95 ${on ? 'text-[var(--color-pink)]' : ''}`}
              >
                <IconHeart size={16} filled={on} />
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
