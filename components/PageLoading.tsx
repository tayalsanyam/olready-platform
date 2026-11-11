import { Marigold } from './Art';

/** What a dashboard shows while its data arrives: the page's shape in shimmer, and a turning marigold. */
export function PageLoading({ wide = false }: { wide?: boolean }) {
  return (
    <div className={wide ? '' : 'mx-auto w-full max-w-6xl px-4'} aria-busy="true" aria-live="polite">
      <div className="mb-4 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Marigold size={22} spin />
        Getting things ready
      </div>
      <div className="skel h-32 rounded-3xl" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel h-20" />
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="skel h-4 w-40" />
            <div className="skel mt-3 h-3 w-full" />
            <div className="skel mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
