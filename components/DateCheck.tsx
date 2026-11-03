import type { DateCheck } from '@/lib/availability';

const TONE: Record<DateCheck['tone'], string> = {
  ok: 'bg-[#e6f4ec] text-[#1d5c3a]',
  warn: 'bg-[#fff6e0] text-[#6b4a00]',
  bad: 'bg-[var(--color-pink-soft)] text-[var(--color-pink-deep)]',
  muted: 'bg-[var(--color-tint)] text-[var(--color-muted)]',
};

/** "Is this vendor free on my date?" A GET form, so it works without JavaScript and can be shared. */
export function DateCheckBox({ action, date, checks, id }: { action: string; date: string | null; checks: DateCheck[]; id: string }) {
  return (
    <div>
      <form action={action} method="get" className="flex items-end gap-2">
        <label className="grow" htmlFor={id}>
          <span className="label">Check a date</span>
          <input id={id} name="date" type="date" defaultValue={date ?? ''} className="input" />
        </label>
        <button className="btn btn-ghost btn-sm mb-0.5">Check</button>
      </form>
      {checks.length ? (
        <ul className="mt-2 space-y-1.5 text-sm" aria-live="polite">
          {checks.map((c) => (
            <li key={c.day} className={`rounded-lg px-3 py-1.5 ${TONE[c.tone]}`}>
              {c.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
