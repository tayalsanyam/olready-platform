import type { QuoteReading as R } from '@/lib/quoteReader';

/** The AI reading of a quote, in three short lists. Labelled, because it is a summary, not the vendor's words. */
export function QuoteReading({ r, compact = false }: { r: R; compact?: boolean }) {
  const groups = [
    { key: 'included', label: 'Included', items: r.included, mark: '✓', tone: 'text-emerald-700' },
    { key: 'extra', label: 'Charged extra', items: r.extra, mark: '+', tone: 'text-amber-700' },
    { key: 'ask', label: 'Worth asking', items: r.ask, mark: '?', tone: 'text-[var(--color-pink-deep)]' },
  ].filter((g) => g.items.length);
  if (!groups.length) return null;
  return (
    <div className={`rounded-xl bg-[var(--color-tint)] ${compact ? 'mt-2 p-2.5' : 'mt-3 p-3'} text-sm`}>
      {groups.map((g) => (
        <div key={g.key} className="mt-2 first:mt-0">
          <p className="text-xs font-semibold text-[var(--color-muted)]">{g.label}</p>
          <ul className="mt-0.5 space-y-0.5">
            {g.items.map((x) => (
              <li key={x} className="flex gap-1.5">
                <span aria-hidden className={`w-3 shrink-0 font-semibold ${g.tone}`}>
                  {g.mark}
                </span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">Summarised from the quote by AI. Check the vendor&apos;s own words above.</p>
    </div>
  );
}
