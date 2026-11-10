import { describeFunction, type LeadFunction } from '@/lib/functions';

/** The big days on a request, one per line: "Mehendi, 12 Feb, 150 guests". */
export function FunctionList({ fns, className = '' }: { fns: (Pick<LeadFunction, 'name' | 'event_date' | 'guests'> & { place?: string | null; city?: string | null; time_of_day?: LeadFunction['time_of_day'] })[]; className?: string }) {
  if (!fns.length) return null;
  return (
    <ul className={`space-y-0.5 text-sm ${className}`}>
      {fns.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex gap-2">
          <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-pink)]" />
          {describeFunction({ id: '', place: null, ...f })}
        </li>
      ))}
    </ul>
  );
}
