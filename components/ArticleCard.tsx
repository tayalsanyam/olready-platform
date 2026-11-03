import Link from 'next/link';
import type { Article } from '@/lib/articles';
import { SECTIONS } from '@/lib/articles';
import { readingMinutes } from '@/lib/markdown';
import { Cover } from './ui';

export function ArticleCard({ a, big = false }: { a: Article; big?: boolean }) {
  return (
    <Link href={`/blog/${a.slug}`} className="group block">
      <div className={`${big ? 'aspect-[16/9]' : 'aspect-[4/3]'} overflow-hidden rounded-[14px]`}>
        <Cover url={a.cover_url} name={a.title} />
      </div>
      <p className="mt-2 text-xs font-semibold text-[var(--color-pink-deep)]">{SECTIONS[a.section]?.label}</p>
      <h3 className={`${big ? 'text-2xl' : 'text-lg'} mt-0.5 font-semibold leading-snug group-hover:text-[var(--color-pink-deep)]`}>{a.title}</h3>
      {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{a.excerpt}</p> : null}
      <p className="mt-1 text-xs text-[var(--color-muted)]">{readingMinutes(a.body)} min read</p>
    </Link>
  );
}
