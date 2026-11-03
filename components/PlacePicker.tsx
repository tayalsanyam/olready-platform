'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Town = { id: number; name: string; state: string };
type Area = { id: number | null; name: string; pincode: string | null };
type Place =
  | { kind: 'town'; city_id: number; city: string; state: string; launched: boolean }
  | { kind: 'pincode'; city_id: number | null; city: string | null; state: string; pincode: string; area: string | null; locality_id: number | null }
  | { kind: 'area'; city_id: number; city: string; state: string; locality_id: number; area: string; pincode: string | null };

/** "Mohali, Punjab", but just "Chandigarh" or "Delhi" where the town and the state share a name. */
const withState = (name: string | null | undefined, state: string | null | undefined) => [name, state && state !== name ? state : null].filter(Boolean).join(', ');

async function lookup(q: string, city?: number | null): Promise<Place[]> {
  const u = `/api/public/places?q=${encodeURIComponent(q)}${city ? `&city=${city}` : ''}`;
  try {
    const r = await fetch(u);
    return r.ok ? ((await r.json()).places as Place[]) : [];
  } catch {
    return [];
  }
}

/** One type-ahead box with a listbox, keyboard support and a debounce. */
function Combo(props: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  quick?: Place[];
  search: (q: string) => Promise<Place[]>;
  render: (p: Place) => { main: string; sub?: string };
  onPick: (p: Place) => void;
  onType: (text: string) => void;
}) {
  const [text, setText] = useState(props.value);
  const [items, setItems] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  useEffect(() => setText(props.value), [props.value]);

  const run = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      const res = q.trim().length >= 2 || /^\d{3,6}$/.test(q.trim()) ? await props.search(q) : props.quick ?? [];
      if (mine === seq.current) {
        setItems(res);
        setActive(res.length ? 0 : -1);
      }
    }, 150);
  };
  const pick = (p: Place) => {
    props.onPick(p);
    setOpen(false);
  };
  const listId = `${props.id}-list`;
  return (
    <div className="relative">
      <label htmlFor={props.id} className="label">
        {props.label}
      </label>
      <input
        id={props.id}
        className="input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={props.placeholder}
        disabled={props.disabled}
        required={props.required}
        onFocus={() => {
          setOpen(true);
          run(text);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          props.onType(e.target.value);
          setOpen(true);
          run(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {props.hint ? <span className="hint mt-1 block">{props.hint}</span> : null}
      {open && items.length ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[var(--color-line)] bg-white py-1 shadow-lg">
          {items.map((p, i) => {
            const r = props.render(p);
            return (
              <li
                key={i}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-[var(--color-tint)]' : ''}`}
              >
                <span className="block">{r.main}</span>
                {r.sub ? <span className="block text-xs text-[var(--color-muted)]">{r.sub}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Town (any town in India) and, optionally, the area and pincode within it. Posts city_id, and with
 * withArea also locality_id and pincode. A pincode typed in either box fills both.
 */
export function PlacePicker(props: {
  town?: Town | null;
  area?: Area | null;
  quick?: Town[];
  withArea?: boolean;
  required?: boolean;
  label?: string;
  areaLabel?: string;
  townHint?: string;
  names?: { city?: string; locality?: string; pincode?: string };
}) {
  const uid = useId();
  const n = { city: 'city_id', locality: 'locality_id', pincode: 'pincode', ...props.names };
  const [town, setTown] = useState<Town | null>(props.town ?? null);
  const [area, setArea] = useState<Area | null>(props.area ?? null);
  const [areaText, setAreaText] = useState(props.area ? `${props.area.name}${props.area.pincode ? `, ${props.area.pincode}` : ''}` : '');
  const quick: Place[] = (props.quick ?? []).map((t) => ({ kind: 'town', city_id: t.id, city: t.name, state: t.state, launched: true }));

  const fromPincode = (p: Extract<Place, { kind: 'pincode' }>) => {
    if (p.city_id && p.city) setTown({ id: p.city_id, name: p.city, state: p.state });
    setArea({ id: p.locality_id, name: p.area ?? '', pincode: p.pincode });
    setAreaText(`${p.area ? `${p.area}, ` : ''}${p.pincode}`);
  };

  return (
    <div className={props.withArea ? 'grid gap-3 sm:grid-cols-2' : ''}>
      <Combo
        id={`${uid}-town`}
        label={props.label ?? 'Town or city'}
        hint={props.townHint}
        value={town ? withState(town.name, town.state) : ''}
        placeholder="Type a town or a pincode"
        required={props.required}
        quick={quick}
        search={(q) => lookup(q)}
        render={(p) =>
          p.kind === 'pincode' ? { main: `${p.pincode}${p.area ? `, ${p.area}` : ''}`, sub: withState(p.city, p.state) } : { main: p.city ?? '', sub: p.state !== p.city ? p.state : undefined }
        }
        onPick={(p) => {
          if (p.kind === 'pincode') fromPincode(p);
          else if (p.city_id) {
            if (town?.id !== p.city_id) {
              setArea(null);
              setAreaText('');
            }
            setTown({ id: p.city_id, name: p.city ?? '', state: p.state });
          }
        }}
        onType={() => setTown(null)}
      />
      <input type="hidden" name={n.city} value={town?.id ?? ''} />
      {props.withArea ? (
        <>
          <Combo
            id={`${uid}-area`}
            label={props.areaLabel ?? 'Area or pincode (optional)'}
            value={areaText}
            placeholder={town ? `e.g. ${town.name === 'Chandigarh' ? 'Sector 35' : 'your area'} or a pincode` : 'Choose the town first, or type a pincode'}
            search={(q) => lookup(q, /^\d{3,6}$/.test(q.trim()) ? null : town?.id)}
            render={(p) =>
              p.kind === 'pincode'
                ? { main: `${p.pincode}${p.area ? `, ${p.area}` : ''}`, sub: withState(p.city, p.state) }
                : p.kind === 'area'
                  ? { main: p.area, sub: p.pincode ?? undefined }
                  : { main: p.city ?? '' }
            }
            onPick={(p) => {
              if (p.kind === 'pincode') fromPincode(p);
              else if (p.kind === 'area') {
                setArea({ id: p.locality_id, name: p.area, pincode: p.pincode });
                setAreaText(`${p.area}${p.pincode ? `, ${p.pincode}` : ''}`);
              }
            }}
            onType={(t) => {
              const pin = t.replace(/\s/g, '');
              setArea(/^[1-9]\d{5}$/.test(pin) ? { id: null, name: '', pincode: pin } : null);
            }}
          />
          <input type="hidden" name={n.locality} value={area?.id ?? ''} />
          <input type="hidden" name={n.pincode} value={area?.pincode ?? ''} />
        </>
      ) : null}
    </div>
  );
}

/** The towns a vendor works in, as removable chips with a box to add more. Posts service_city_id (repeated). */
export function TownChips(props: { towns: Town[]; base?: Town | null; max?: number; name?: string }) {
  const uid = useId();
  const [towns, setTowns] = useState<Town[]>(props.towns.filter((t) => t.id !== props.base?.id));
  const [key, setKey] = useState(0);
  const max = props.max ?? 29;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Towns you also work in">
        {props.base ? <li className="chip">{props.base.name} (base)</li> : null}
        {towns.map((t) => (
          <li key={t.id} className="chip gap-1.5">
            {t.name}
            <button type="button" aria-label={`Remove ${t.name}`} onClick={() => setTowns((x) => x.filter((y) => y.id !== t.id))} className="text-[var(--color-muted)] hover:text-[var(--color-pink-deep)]">
              ×
            </button>
            <input type="hidden" name={props.name ?? 'service_city_id'} value={t.id} />
          </li>
        ))}
      </ul>
      {towns.length < max ? (
        <div className="mt-2 max-w-sm">
          <Combo
            key={key}
            id={`${uid}-add`}
            label="Add a town you travel to"
            value=""
            placeholder="Type a town"
            search={(q) => lookup(q)}
            render={(p) => (p.kind === 'pincode' ? { main: `${p.pincode}, ${p.city ?? ''}`, sub: p.state } : { main: p.city ?? '', sub: p.state })}
            onPick={(p) => {
              if (p.city_id && p.city && p.city_id !== props.base?.id && !towns.some((t) => t.id === p.city_id)) setTowns((x) => [...x, { id: p.city_id!, name: p.city!, state: p.state }]);
              setKey((k) => k + 1);
            }}
            onType={() => undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
