'use client';

import { useState } from 'react';

type Row = { key: number; name: string; price: string; unit: string; onwards: boolean; details: string };
type Preset = { name: string; unit: string };
let next = 1;

/** Editable price list. Rows post as offer_name_0, offer_price_0 … and are read by offersFromForm. */
export function OfferRows({ initial, presets, units, max }: { initial: { name: string; price_inr: number | null; unit: string; onwards: boolean; details: string }[]; presets: Preset[]; units: Record<string, string>; max: number }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((o) => ({ key: next++, name: o.name, price: o.price_inr == null ? '' : String(o.price_inr), unit: o.unit, onwards: o.onwards, details: o.details })));
  const add = (p?: Preset) => setRows((r) => (r.length >= max ? r : [...r, { key: next++, name: p?.name ?? '', price: '', unit: p?.unit ?? 'event', onwards: false, details: '' }]));
  const set = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const unused = presets.filter((p) => !rows.some((r) => r.name.trim().toLowerCase() === p.name.toLowerCase()));
  return (
    <div>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-line)] p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="col-span-2 sm:col-span-1">
                <span className="sr-only">What you offer</span>
                <input name={`offer_name_${i}`} value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} className="input" placeholder="What you offer" maxLength={80} required />
              </label>
              <label>
                <span className="sr-only">Price in rupees</span>
                <input name={`offer_price_${i}`} value={r.price} onChange={(e) => set(r.key, { price: e.target.value.replace(/[^\d]/g, '') })} className="input" placeholder="Price ₹" inputMode="numeric" />
              </label>
              <label>
                <span className="sr-only">Charged</span>
                <select name={`offer_unit_${i}`} value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value })} className="input">
                  {Object.entries(units).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="btn btn-ghost btn-sm col-start-2 w-10 justify-center justify-self-end px-0 sm:col-start-4 sm:row-start-1" aria-label={`Remove ${r.name || 'this line'}`}>
                ×
              </button>
              <label className="col-span-2 sm:col-span-3">
                <span className="sr-only">What is included</span>
                <input name={`offer_details_${i}`} value={r.details} onChange={(e) => set(r.key, { details: e.target.value })} className="input" placeholder="What is included (optional)" maxLength={300} />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
                <input type="checkbox" name={`offer_onwards_${i}`} checked={r.onwards} onChange={(e) => set(r.key, { onwards: e.target.checked })} className="h-4 w-4 accent-[var(--color-pink)]" />
                This is a starting price (shown as &quot;onwards&quot;)
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nothing listed yet. Pick from the suggestions or add your own line.</p>
      )}
      {rows.length < max ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {unused.slice(0, 8).map((p) => (
            <button key={p.name} type="button" onClick={() => add(p)} className="rounded-full border border-dashed border-[var(--color-line)] px-3 py-1.5 text-sm hover:border-[var(--color-pink)]">
              + {p.name}
            </button>
          ))}
          <button type="button" onClick={() => add()} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium hover:border-[var(--color-ink)]">
            + Your own line
          </button>
        </div>
      ) : (
        <p className="hint mt-2">A price list holds up to {max} lines.</p>
      )}
    </div>
  );
}
