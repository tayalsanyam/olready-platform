'use client';

import { useState } from 'react';

type Cat = { id: number; slug: string; plural_name: string; price_unit: string };
type Row = { key: number; name: string; date: string; guests: string; place: string };
type Fn = { name: string; date: string | null; guests: number | null; place?: string | null };

const PRESETS = ['Roka', 'Sagan', 'Engagement', 'Mehendi', 'Haldi', 'Jaggo', 'Sangeet', 'Cocktail', 'Wedding', 'Anand Karaj', 'Reception'];
const MAX = 8;
let nextKey = 1;

/**
 * The big days and what each vendor is needed for. Rows post as fn_name_N / fn_date_N /
 * fn_guests_N; each category posts fn_for_<id> with the row numbers it is needed for.
 */
export function RequestFunctions(props: { cats: Cat[]; preCats: string[]; initial: Fn[]; single?: { id: number; name: string; budgetHint?: string } }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (props.initial.length ? props.initial : [{ name: 'Wedding', date: null, guests: null }]).map((f) => ({ key: nextKey++, name: f.name, date: f.date ?? '', guests: f.guests ? String(f.guests) : '', place: f.place ?? '' }))
  );
  const [picked, setPicked] = useState<Set<number>>(() => new Set(props.single ? [props.single.id] : props.cats.filter((c) => props.preCats.includes(c.slug)).map((c) => c.id)));
  // Per category, the row keys it is NOT needed for (so new rows are included by default).
  const [skip, setSkip] = useState<Record<number, number[]>>({});

  const update = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const add = (name = '') => rows.length < MAX && setRows((r) => [...r, { key: nextKey++, name, date: '', guests: '', place: '' }]);
  const remove = (key: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));
  const named = rows.filter((r) => r.name.trim());
  const toggleFor = (catId: number, key: number) =>
    setSkip((s) => {
      const cur = new Set(s[catId] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...s, [catId]: [...cur] };
    });

  function Picks({ catId, label }: { catId: number; label: string }) {
    if (named.length < 2) return null;
    const off = new Set(skip[catId] ?? []);
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm sm:col-span-2" role="group" aria-label={`Functions for ${label}`}>
        <span className="text-[var(--color-muted)]">For</span>
        {rows.map((r, i) =>
          r.name.trim() ? (
            <button
              key={r.key}
              type="button"
              aria-pressed={!off.has(r.key)}
              onClick={() => toggleFor(catId, r.key)}
              className={`rounded-full border px-2.5 py-0.5 ${off.has(r.key) ? 'border-[var(--color-line)] text-[var(--color-muted)] line-through' : 'border-[var(--color-pink)] bg-[var(--color-pink-soft)]'}`}
            >
              {r.name}
              {!off.has(r.key) ? <input type="hidden" name={`fn_for_${catId}`} value={i} /> : null}
            </button>
          ) : null
        )}
      </div>
    );
  }

  const unused = PRESETS.filter((p) => !rows.some((r) => r.name.trim().toLowerCase() === p.toLowerCase()));
  return (
    <>
      <div className="card p-4 sm:p-5">
        <h2 className="font-semibold">Your functions</h2>
        <p className="hint">Vendors price per function. Add the ones you know; rough dates, guest counts and places are fine.</p>
        <datalist id="fn-presets">
          {PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <ul className="mt-3 space-y-3 sm:space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)_2.5rem] gap-2 border-t border-[var(--color-line)] pt-3 first:border-0 first:pt-0 sm:border-0 sm:pt-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px_2.5rem]">
              <input
                name={`fn_name_${i}`}
                list="fn-presets"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                className="input col-span-2 min-w-0 sm:col-span-1"
                placeholder="Function, e.g. Mehendi"
                aria-label={`Function ${i + 1}`}
                maxLength={40}
              />
              <button type="button" onClick={() => remove(r.key)} disabled={rows.length === 1} className="btn btn-ghost btn-sm w-10 justify-center self-center px-0 sm:order-last" aria-label={`Remove ${r.name || `function ${i + 1}`}`}>
                ×
              </button>
              <input name={`fn_date_${i}`} type="date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} className="input min-w-0" aria-label={`Date of ${r.name || `function ${i + 1}`}`} />
              <input
                name={`fn_guests_${i}`}
                inputMode="numeric"
                value={r.guests}
                onChange={(e) => update(r.key, { guests: e.target.value.replace(/[^\d]/g, '') })}
                className="input col-span-2 min-w-0 sm:col-span-1"
                placeholder="Guests"
                aria-label={`Guests at ${r.name || `function ${i + 1}`}`}
              />
              <input
                name={`fn_place_${i}`}
                value={r.place}
                onChange={(e) => update(r.key, { place: e.target.value })}
                className="input col-span-3 min-w-0 sm:col-span-4"
                placeholder="Where (optional): home, a venue, an area"
                aria-label={`Where is ${r.name || `function ${i + 1}`}`}
                maxLength={80}
              />
            </li>
          ))}
        </ul>
        {rows.length < MAX ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unused.map((p) => (
              <button key={p} type="button" onClick={() => add(p)} className="rounded-full border border-dashed border-[var(--color-line)] px-2.5 py-1 text-sm hover:border-[var(--color-pink)]">
                + {p}
              </button>
            ))}
            <button type="button" onClick={() => add()} className="rounded-full border border-dashed border-[var(--color-line)] px-2.5 py-1 text-sm hover:border-[var(--color-pink)]">
              + Another
            </button>
          </div>
        ) : null}
      </div>

      {props.single ? (
        <div className="card p-4 sm:p-5">
          <label className="block">
            <span className="label">Your budget for {props.single.name.toLowerCase()} (optional)</span>
            <input name={`budget_${props.single.id}`} className="input mt-1" inputMode="numeric" placeholder="₹" />
          </label>
          {props.single.budgetHint ? <p className="hint mt-1">{props.single.budgetHint}</p> : null}
          <Picks catId={props.single.id} label={props.single.name} />
        </div>
      ) : (
        <div className="card p-4 sm:p-5">
          <h2 className="font-semibold">What do you need?</h2>
          <p className="hint">Add a budget if you have one. It helps us send vendors who fit.</p>
          <ul className="mt-3 divide-y divide-[var(--color-line)]">
            {props.cats.map((c) => (
              <li key={c.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_200px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="category_id"
                    value={c.id}
                    checked={picked.has(c.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-[var(--color-pink)]"
                  />
                  <span>{c.plural_name}</span>
                </label>
                <input name={`budget_${c.id}`} className="input" inputMode="numeric" placeholder={`Budget ₹ (${c.price_unit})`} aria-label={`Budget for ${c.plural_name}`} />
                {picked.has(c.id) ? <Picks catId={c.id} label={c.plural_name} /> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
