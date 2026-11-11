'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Markdown } from '@/lib/markdown';
import { Marigold } from './Art';

/**
 * Everything that reaches out to a visitor who has not signed in: the chat helper, the WhatsApp
 * button, the call-me card, the leaving prompt, and saving vendors before signing in. Each one ends
 * the same way: a mobile number in Ops > Numbers to call. Each prompt shows once, never to someone
 * who has already left a number or sent a request, and never on dashboards or guests' invite pages.
 */

type Props = { signedIn: boolean; role: string | null; whatsapp: string; ai: boolean; prompts: boolean; seconds: number; views: number };
type Turn = { role: 'user' | 'assistant'; text: string };
type Saved = { slug: string; name: string };

const QUIET = /^\/(ops|vendor|me|mfa|welcome|pay|receipt|login|enquire|claim|review|rsvp|i|w|invite|dev-login|widget)(\/|$)/;
const DAY = 864e5;

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private window */
    }
  },
};
const session = {
  get(k: string) {
    try {
      return Number(sessionStorage.getItem(k) ?? 0);
    } catch {
      return 0;
    }
  },
  set(k: string, v: number) {
    try {
      sessionStorage.setItem(k, String(v));
    } catch {
      /* private window */
    }
  },
};
const within = (k: string, days: number) => Date.now() - store.get<number>(k, 0) < days * DAY;

async function post<T>(url: string, body: unknown): Promise<T & { error?: string }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json().catch(() => ({ error: 'Something went wrong. Try again.' }))) as T & { error?: string };
}

/** The one form every prompt shares: mobile first, name if she likes. */
function NumberForm({ source, cta, onDone, extra, autoFocus }: { source: string; cta: string; onDone: () => void; extra?: Record<string, unknown>; autoFocus?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    const r = await post<{ ok?: boolean }>('/api/public/capture', { phone: fd.get('phone'), name: fd.get('name'), company: fd.get('company'), source, page: location.pathname, ...extra });
    setBusy(false);
    if (r.error) return setError(r.error);
    store.set('olr_cap', Date.now());
    onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-2" noValidate>
      <label className="block">
        <span className="sr-only">Mobile number</span>
        <input name="phone" required inputMode="tel" autoComplete="tel" placeholder="Mobile number" className="input" autoFocus={autoFocus} aria-invalid={Boolean(error)} />
      </label>
      <label className="block">
        <span className="sr-only">Your name (optional)</span>
        <input name="name" autoComplete="name" placeholder="Your name (optional)" className="input" maxLength={80} />
      </label>
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <input name="company" tabIndex={-1} autoComplete="off" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-bad)]">
          {error}
        </p>
      ) : null}
      <button className="btn btn-pink" aria-busy={busy} disabled={busy}>
        {cta}
      </button>
      <p className="hint">Our team calls once, Monday to Saturday, 10:00 to 18:30. Vendors do not get your number until you say so on that call.</p>
    </form>
  );
}

function Thanks({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-2 text-center" data-celebrate="">
      <Marigold size={44} className="pop mx-auto" />
      <p className="mt-2 font-semibold">We have your number</p>
      <p className="hint mt-1">{children}</p>
    </div>
  );
}

const Close = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-[var(--color-muted)] hover:bg-[var(--color-tint)]">
    ×
  </button>
);

export function Capture(p: Props) {
  const path = usePathname();
  const quiet = QUIET.test(path);
  const visitor = !p.signedIn;
  const [panel, setPanel] = useState<null | 'chat' | 'call'>(null);
  const [slip, setSlip] = useState<'hidden' | 'open' | 'done'>('hidden');
  const [exit, setExit] = useState<'hidden' | 'open' | 'done'>('hidden');
  const [toast, setToast] = useState<null | { text: string; ask: boolean; done?: boolean }>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const exitRef = useRef<HTMLDialogElement>(null);

  // ---------------------------------------------------------------- chat
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState('');
  const [thinking, setThinking] = useState(false);
  const [needPhone, setNeedPhone] = useState(false);
  const [pending, setPending] = useState('');
  const [chatError, setChatError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || thinking) return;
      setChatError('');
      setTurns((t) => (t.at(-1)?.role === 'user' && t.at(-1)?.text === q ? t : [...t, { role: 'user', text: q }]));
      setThinking(true);
      const r = await post<{ chatId: string; text: string; needPhone: boolean }>('/api/public/ask', { text: q, chatId, page: location.pathname });
      setThinking(false);
      if (r.error) return setChatError(r.error);
      if (r.chatId) setChatId(r.chatId);
      if (r.needPhone) {
        setPending(q);
        return setNeedPhone(true);
      }
      setTurns((t) => [...t, { role: 'assistant', text: r.text }]);
    },
    [chatId, thinking]
  );
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking, needPhone]);

  // ---------------------------------------------------------------- saved vendors before sign-in
  const paintHearts = useCallback((list: Saved[]) => {
    const on = new Set(list.map((s) => s.slug));
    document.querySelectorAll<HTMLFormElement>('form[data-save]').forEach((f) => {
      const btn = f.querySelector('button');
      const is = on.has(f.dataset.save ?? '');
      btn?.setAttribute('aria-pressed', String(is));
      btn?.classList.toggle('text-[var(--color-pink)]', is);
      btn?.querySelector('svg')?.setAttribute('fill', is ? 'currentColor' : 'none');
      const label = btn?.querySelector('[data-save-label]');
      if (label) label.textContent = is ? 'Saved' : 'Shortlist';
    });
  }, []);

  useEffect(() => {
    if (!visitor) return;
    const list = store.get<Saved[]>('olr_saved', []);
    setSaved(list);
    const t = setTimeout(() => paintHearts(list), 60);
    return () => clearTimeout(t);
  }, [path, visitor, paintHearts]);

  useEffect(() => {
    if (!visitor) return;
    // Runs before the page's own handler, so a visitor's heart is kept here instead of sending her to sign in.
    const onSubmit = (e: Event) => {
      const f = (e.target as HTMLElement | null)?.closest?.('form[data-save]') as HTMLFormElement | null;
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();
      const slug = f.dataset.save ?? '';
      const name = f.dataset.saveName ?? 'This vendor';
      const cur = store.get<Saved[]>('olr_saved', []);
      const has = cur.some((s) => s.slug === slug);
      const next = has ? cur.filter((s) => s.slug !== slug) : [...cur, { slug, name }].slice(-20);
      store.set('olr_saved', next);
      setSaved(next);
      paintHearts(next);
      setToast(has ? { text: `Removed ${name}`, ask: false } : { text: `Saved ${name}`, ask: !within('olr_cap', 30) });
    };
    document.addEventListener('submit', onSubmit, true);
    return () => document.removeEventListener('submit', onSubmit, true);
  }, [visitor, paintHearts]);

  // "Ask Olready" and "Help me choose" links lead to the signed-in helper. A visitor gets the chat here instead of a sign-in wall.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    if (!visitor || !p.ai) return;
    const words = (slug: string | null) => (slug ?? '').replace(/-demo$/, '').replace(/-/g, ' ').trim();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="/me/assistant"]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      const u = new URL(a.href, location.href);
      const [cat, city, vendor] = [words(u.searchParams.get('category')), words(u.searchParams.get('city')), words(u.searchParams.get('vendor'))];
      setSlip('hidden');
      setPanel('chat');
      if (cat && city) void askRef.current(`Help me choose ${cat} in ${city}. What should I look at?`);
      else if (vendor) void askRef.current(`Tell me about ${vendor}. Are they a good fit, and who else is similar?`);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [visitor, p.ai]);

  useEffect(() => {
    if (!toast || toast.ask) return;
    const t = setTimeout(() => setToast(null), toast.done ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------------------------------------------------------- prompts
  useEffect(() => {
    if (path === '/enquire/thanks') store.set('olr_cap', Date.now());
  }, [path]);

  useEffect(() => {
    if (!visitor || quiet || !p.prompts) return;
    if (within('olr_cap', 30) || within('olr_slip', 7) || session.get('olr_prompted')) return;
    const browsing = /^\/(vendors|v|cost|search|look|collections)(\/|$)/.test(path);
    if (browsing) session.set('olr_views', session.get('olr_views') + 1);
    const start = session.get('olr_start') || Date.now();
    session.set('olr_start', start);
    const show = () => {
      if (panelRef.current || within('olr_cap', 30) || session.get('olr_prompted')) return;
      session.set('olr_prompted', 1);
      store.set('olr_slip', Date.now());
      setSlip('open');
    };
    if (session.get('olr_views') >= p.views) {
      const t = setTimeout(show, 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(show, Math.max(4000, p.seconds * 1000 - (Date.now() - start)));
    return () => clearTimeout(t);
  }, [path, visitor, quiet, p.prompts, p.seconds, p.views]);

  const panelRef = useRef(false);
  panelRef.current = panel !== null || exit === 'open';

  useEffect(() => {
    if (!visitor || quiet || !p.prompts) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const arrived = Date.now();
    const leave = (e: MouseEvent) => {
      if (e.clientY > 0 || e.relatedTarget) return;
      if (Date.now() - arrived < 8000 || panelRef.current) return;
      if (within('olr_cap', 30) || within('olr_exit', 14) || session.get('olr_prompted')) return;
      session.set('olr_prompted', 1);
      store.set('olr_exit', Date.now());
      setSlip('hidden');
      setExit('open');
    };
    document.addEventListener('mouseout', leave);
    return () => document.removeEventListener('mouseout', leave);
  }, [path, visitor, quiet, p.prompts]);

  useEffect(() => {
    const d = exitRef.current;
    if (!d) return;
    if (exit !== 'hidden' && !d.open) d.showModal();
    if (exit === 'hidden' && d.open) d.close();
  }, [exit]);

  // The WhatsApp message names the page she is on. Filled in after the page loads, so server and browser agree.
  const [wa, setWa] = useState(`https://wa.me/${p.whatsapp}`);
  useEffect(() => {
    const t = setTimeout(() => {
      const title = document.title.replace(/\s*[|·-]\s*Olready.*$/i, '');
      setWa(`https://wa.me/${p.whatsapp}?text=${encodeURIComponent(`Hi Olready, I am looking at ${title} (${location.origin}${path}).`)}`);
    }, 300);
    return () => clearTimeout(t);
  }, [path, p.whatsapp]);

  if (quiet || (p.signedIn && p.role !== 'bride')) return null;

  const starters = ['Makeup artists in Chandigarh under ₹25,000', 'What does a wedding photographer cost?', 'Venues in Mohali for 300 guests'];

  return (
    <>
      {/* The dock: always there, never over the page's own buttons. */}
      <div className="capture-dock fixed right-3 z-40 flex flex-col items-end gap-2 sm:right-5" style={{ bottom: 'calc(var(--dock-bottom, 1rem) + env(safe-area-inset-bottom, 0px))' }}>
        {visitor && saved.length && panel === null && !toast ? (
          <a href="/enquire" className="rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium shadow-[0_8px_24px_-12px_rgb(17_16_20/.45)]">
            {saved.length} saved · get quotes
          </a>
        ) : null}
        {panel === null && !toast?.ask ? (
          <>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center gap-2 rounded-full border border-[#bfe3cd] bg-white px-3.5 font-medium text-[#12703f] shadow-[0_8px_24px_-12px_rgb(17_16_20/.45)] hover:bg-[#f1faf4]"
              aria-label="Chat with our team on WhatsApp"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20l1.3-4A8 8 0 1 1 8.2 18.8L4 20z" />
                <path d="M9.5 8.8c-.3 2.6 2.4 5.5 5 5.6l1.2-1.3-1.7-1.1-.8.6c-.9-.4-1.6-1.1-2-2l.6-.8-1.1-1.7-1.2.7z" fill="currentColor" stroke="none" />
              </svg>
              <span className="hidden sm:inline">WhatsApp us</span>
            </a>
            {visitor ? (
              <button
                type="button"
                onClick={() => {
                  setSlip('hidden');
                  setPanel(p.ai ? 'chat' : 'call');
                }}
                className="flex h-14 items-center gap-2 rounded-full bg-[var(--color-pink)] pl-2 pr-4 font-semibold text-white shadow-[0_12px_28px_-10px_rgb(226_0_94/.7)] transition-transform hover:-translate-y-0.5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                  <Marigold size={30} />
                </span>
                {p.ai ? 'Ask Olready' : 'Call me back'}
              </button>
            ) : (
              <a href="/me/assistant" className="flex h-14 items-center gap-2 rounded-full bg-[var(--color-pink)] pl-2 pr-4 font-semibold text-white shadow-[0_12px_28px_-10px_rgb(226_0_94/.7)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                  <Marigold size={30} />
                </span>
                Ask Olready
              </a>
            )}
          </>
        ) : null}
      </div>

      {/* Chat, or just the number, in one panel. */}
      {panel ? (
        <section
          role="dialog"
          aria-label={panel === 'chat' ? 'Ask Olready' : 'Call me back'}
          className="arrive fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-[var(--color-line)] bg-white shadow-[0_24px_60px_-20px_rgb(17_16_20/.5)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px] sm:rounded-3xl"
        >
          <header className="jaali flex items-center gap-3 bg-[var(--color-pink-soft)] px-4 py-3">
            <Marigold size={34} />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold leading-tight">{panel === 'chat' ? 'Ask Olready' : 'We will call you'}</h2>
              <p className="hint">{panel === 'chat' ? 'Vendors, prices and ideas. Free, no sign-up.' : 'Leave your number. One call, no spam.'}</p>
            </div>
            <Close onClick={() => setPanel(null)} label="Close" />
          </header>

          {panel === 'call' ? (
            <div className="p-4">
              {slip === 'done' ? <Thanks>We will ring you soon. Keep browsing in the meantime.</Thanks> : <NumberForm source="dock" cta="Call me back" autoFocus onDone={() => setSlip('done')} />}
              {p.ai ? (
                <button type="button" onClick={() => setPanel('chat')} className="mt-3 text-sm underline underline-offset-2">
                  Ask a question instead
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
                {!turns.length ? (
                  <div>
                    <p className="text-sm text-[var(--color-muted)]">Tell me the town, the date and what you need. I only suggest vendors listed on Olready.</p>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {starters.map((s) => (
                        <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-left text-sm hover:border-[var(--color-pink)]">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {turns.map((t, i) =>
                  t.role === 'user' ? (
                    <p key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-pink-soft)] px-3.5 py-2 text-[15px]">
                      {t.text}
                    </p>
                  ) : (
                    <div key={i} className="arrive max-w-[95%] text-[15px] [&_a]:font-medium [&_a]:text-[var(--color-pink-deep)] [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p+p]:mt-2 [&_ul]:mt-1">
                      <Markdown source={t.text} />
                    </div>
                  )
                )}
                {thinking ? (
                  <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                    <Marigold size={18} spin /> Looking that up
                  </p>
                ) : null}
                {needPhone ? (
                  <div className="arrive rounded-2xl border border-[var(--color-line)] p-3">
                    <p className="font-semibold">Share your number to keep going</p>
                    <p className="hint mb-2">I will answer straight away, and our team will call to help you get real quotes.</p>
                    <NumberForm
                      source="chat"
                      cta="Continue"
                      extra={{ chatId }}
                      onDone={() => {
                        setNeedPhone(false);
                        const q = pending;
                        setPending('');
                        void ask(q);
                      }}
                    />
                  </div>
                ) : null}
                {chatError ? (
                  <div role="alert" className="rounded-2xl bg-[var(--color-tint)] p-3 text-sm">
                    {chatError}{' '}
                    <button type="button" onClick={() => setPanel('call')} className="font-medium underline">
                      Leave your number
                    </button>
                  </div>
                ) : null}
              </div>
              {!needPhone ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement;
                    const q = input.value;
                    input.value = '';
                    void ask(q);
                  }}
                  className="flex gap-2 border-t border-[var(--color-line)] p-3"
                >
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Your question</span>
                    <input name="q" className="input" placeholder="Ask about vendors or prices" maxLength={600} autoComplete="off" />
                  </label>
                  <button className="btn btn-pink shrink-0" disabled={thinking} data-quiet="">
                    Ask
                  </button>
                </form>
              ) : null}
              <button type="button" onClick={() => setPanel('call')} className="border-t border-[var(--color-line)] px-4 py-2.5 text-left text-sm text-[var(--color-muted)] hover:bg-[var(--color-tint)]">
                Prefer a call? <span className="font-medium text-[var(--color-ink)] underline">Leave your number</span>
              </button>
            </>
          )}
        </section>
      ) : null}

      {/* The call-me card: slides up once, after she has looked around. */}
      {slip !== 'hidden' && panel === null ? (
        <aside
          aria-label="Get a call from Olready"
          className="arrive fixed inset-x-3 z-40 rounded-3xl border border-[var(--color-line)] bg-white p-4 shadow-[0_24px_60px_-20px_rgb(17_16_20/.5)] sm:inset-x-auto sm:left-5 sm:w-[340px]"
          style={{ bottom: 'calc(var(--dock-bottom, 1rem) + 4.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-start gap-3">
            <Marigold size={36} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold leading-tight">Want quotes without the searching?</h2>
              <p className="hint">Leave your number. We call once, note what you need, and verified vendors send you prices.</p>
            </div>
            <Close onClick={() => setSlip('hidden')} label="No thanks" />
          </div>
          <div className="mt-3">{slip === 'done' ? <Thanks>We will ring you soon.</Thanks> : <NumberForm source="slip" cta="Call me" onDone={() => setSlip('done')} />}</div>
        </aside>
      ) : null}

      {/* The leaving prompt, desktop only. */}
      <dialog
        ref={exitRef}
        onClose={() => setExit('hidden')}
        onClick={(e) => {
          if (e.target === e.currentTarget) setExit('hidden');
        }}
        aria-labelledby="exit-title"
        className="m-auto w-[min(92vw,440px)] rounded-3xl border-0 p-0 shadow-[0_30px_80px_-20px_rgb(17_16_20/.6)] backdrop:bg-[rgb(17_16_20/.45)]"
      >
        {exit !== 'hidden' ? (
          <div>
            <div className="jaali relative bg-[var(--color-pink-soft)] px-6 pb-5 pt-6">
              <div className="absolute right-3 top-3">
                <Close onClick={() => setExit('hidden')} label="Close" />
              </div>
              <Marigold size={48} />
              <h2 id="exit-title" className="mt-2 text-3xl leading-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                Three quotes before you go?
              </h2>
              <p className="mt-1 text-[var(--color-muted)]">Leave your number. One short call from our team, then verified vendors send you their prices. It is free.</p>
            </div>
            <div className="p-6">{exit === 'done' ? <Thanks>We will ring you soon.</Thanks> : <NumberForm source="exit" cta="Get my quotes" autoFocus onDone={() => setExit('done')} />}</div>
          </div>
        ) : null}
      </dialog>

      {/* Saved a vendor without signing in. */}
      {toast ? (
        <div
          role="status"
          className="arrive fixed inset-x-3 z-50 rounded-2xl border border-[var(--color-line)] bg-white p-3.5 shadow-[0_24px_60px_-20px_rgb(17_16_20/.5)] sm:inset-x-auto sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2"
          style={{ bottom: 'calc(var(--dock-bottom, 1rem) + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {toast.text}
              {saved.length > 1 && !toast.done ? <span className="font-normal text-[var(--color-muted)]"> · {saved.length} saved</span> : null}
            </p>
            <Close onClick={() => setToast(null)} label="Close" />
          </div>
          {toast.ask ? (
            <div className="mt-1">
              <p className="hint mb-2">Add your number to keep this list and get quotes from {saved.length > 1 ? 'them' : 'this vendor'}.</p>
              <NumberForm source="shortlist" cta="Keep my list" extra={{ slugs: saved.map((s) => s.slug) }} onDone={() => setToast({ text: 'Saved. Our team will call you about these vendors.', ask: false, done: true })} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
