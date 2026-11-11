'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/lib/markdown';
import { decideAssistantAction, rateAssistantMessage } from '@/lib/actions/brideAssistant';

type Action = { id: string; summary: string; status: string };
type Msg = { id: string; role: 'user' | 'assistant'; text: string; helpful: boolean | null; actions: Action[] };

export function AssistantChat(props: { threadId: string | null; initial: Msg[]; starters: string[]; enabled: boolean; offNote: string; left: number }) {
  const router = useRouter();
  const [threadId, setThreadId] = useState(props.threadId);
  const [msgs, setMsgs] = useState<Msg[]>(props.initial);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [left, setLeft] = useState(props.left);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length, status]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError('');
    setBusy(true);
    setStatus('Thinking');
    setDraft('');
    const tempId = `u-${Date.now()}`;
    setMsgs((m) => [...m, { id: tempId, role: 'user', text: q, helpful: null, actions: [] }]);
    let newThread: string | null = null;
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId, text: q }) });
      if (!res.body) throw new Error('No answer');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as
            | { type: 'thread'; id: string }
            | { type: 'status'; text: string }
            | { type: 'done'; threadId: string; messageId: string; text: string; actions: Action[] }
            | { type: 'error'; message: string };
          if (ev.type === 'thread') {
            newThread = ev.id;
            setThreadId(ev.id);
            window.history.replaceState(null, '', `/me/assistant?t=${ev.id}`);
          } else if (ev.type === 'status') setStatus(ev.text);
          else if (ev.type === 'done') {
            setMsgs((m) => [...m, { id: ev.messageId, role: 'assistant', text: ev.text, helpful: null, actions: ev.actions }]);
            setLeft((n) => Math.max(0, n - 1));
          } else if (ev.type === 'error') {
            setError(ev.message);
            setMsgs((m) => m.filter((x) => x.id !== tempId));
            setDraft(q);
          }
        }
      }
    } catch {
      setError('The connection dropped. Try again.');
      setMsgs((m) => m.filter((x) => x.id !== tempId));
      setDraft(q);
    } finally {
      setBusy(false);
      setStatus('');
      if (newThread) router.refresh();
      box.current?.focus();
    }
  }

  async function decide(msgId: string, a: Action, confirm: boolean) {
    const r = await decideAssistantAction(a.id, confirm);
    const status = r.ok ? (r.status ?? a.status) : 'failed';
    if (!r.ok) setError(r.error);
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, actions: x.actions.map((y) => (y.id === a.id ? { ...y, status } : y)) } : x)));
  }

  async function rate(msgId: string, helpful: boolean) {
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, helpful } : x)));
    await rateAssistantMessage(msgId, helpful);
  }

  const empty = msgs.length === 0;
  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-5 pb-4" aria-live="polite">
        {empty ? (
          <div className="rounded-2xl bg-[var(--color-tint)] p-5">
            <p className="text-lg font-semibold">What can I help you plan?</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              I know Olready&apos;s vendors, prices and your own plan. I can shortlist, add tasks and set budgets when you confirm.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {props.starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    disabled={!props.enabled || busy}
                    className="w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 text-left text-sm hover:border-[var(--color-pink)] disabled:opacity-60"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-pink-soft)] px-4 py-2.5 text-[15px]">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%]">
              <div className="assistant-answer text-[15px] leading-relaxed [&_a]:font-medium [&_a]:text-[var(--color-pink-deep)] [&_li]:my-0.5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                <Markdown source={m.text} />
              </div>
              {m.actions.map((a) => (
                <div key={a.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-white p-3 text-sm">
                  <span className="font-medium">{a.summary}</span>
                  {a.status === 'pending' ? (
                    <span className="flex gap-2">
                      <button type="button" className="btn btn-pink btn-sm" onClick={() => decide(m.id, a, true)}>
                        Confirm
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(m.id, a, false)}>
                        Not now
                      </button>
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">{a.status === 'done' ? 'Done' : a.status === 'cancelled' ? 'Skipped' : 'Did not work'}</span>
                  )}
                </div>
              ))}
              <div className="mt-1 flex gap-1 text-xs text-[var(--color-muted)]">
                <button type="button" aria-pressed={m.helpful === true} onClick={() => rate(m.id, true)} className={`rounded-full px-2 py-1 hover:bg-[var(--color-tint)] ${m.helpful === true ? 'bg-[var(--color-tint)] text-[var(--color-ink)]' : ''}`}>
                  Helpful
                </button>
                <button type="button" aria-pressed={m.helpful === false} onClick={() => rate(m.id, false)} className={`rounded-full px-2 py-1 hover:bg-[var(--color-tint)] ${m.helpful === false ? 'bg-[var(--color-tint)] text-[var(--color-ink)]' : ''}`}>
                  Not helpful
                </button>
              </div>
            </div>
          )
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]" role="status">
            <span className="inline-flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-pink)]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-pink)] [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-pink)] [animation-delay:300ms]" />
            </span>
            {status}…
          </p>
        ) : null}
        <div ref={end} />
      </div>
      <form
        className="sticky bottom-0 -mx-4 border-t border-[var(--color-line)] bg-white px-4 pb-3 pt-3 sm:mx-0 sm:rounded-2xl sm:border sm:px-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        {!props.enabled ? <p className="mb-2 text-sm text-[var(--color-muted)]">{props.offNote}</p> : null}
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="sr-only">Your question</span>
            <textarea
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={Math.min(5, Math.max(1, draft.split('\n').length))}
              maxLength={2000}
              placeholder="Ask about your wedding…"
              className="input max-h-40 resize-none"
              disabled={!props.enabled}
            />
          </label>
          <button className="btn btn-pink" disabled={!props.enabled || busy || !draft.trim()}>
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
          {props.enabled ? `${left} questions left today. ` : ''}Answers come from Olready&apos;s listings and your plan; check details with the vendor before you book.
        </p>
      </form>
    </div>
  );
}
