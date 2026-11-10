'use client';

import { useMemo, useState } from 'react';
import { CULTURES, type InviteContent, type InviteDesign } from '@/lib/inviteDesign';
import { InviteCard } from './InviteCard';
import { InviteExport } from './InviteExport';

type Initial = { design: string; opening: string; bride: string; groom: string; family: string; message: string; photo: string | null; publish: boolean };

/** The invite editor: pick a design, type the words, and see the card change as you type. */
export function InviteStudio(props: {
  kind: 'card' | 'save_the_date';
  designs: InviteDesign[];
  initial: Initial;
  dateLine: string;
  events: InviteContent['events'];
  action: (fd: FormData) => Promise<void>;
  saved: { slug: string; published: boolean } | null;
  site: string;
}) {
  const [design, setDesign] = useState(props.initial.design);
  const [opening, setOpening] = useState(props.initial.opening);
  const [bride, setBride] = useState(props.initial.bride);
  const [groom, setGroom] = useState(props.initial.groom);
  const [family, setFamily] = useState(props.initial.family);
  const [message, setMessage] = useState(props.initial.message);
  const [photo, setPhoto] = useState<string | null>(props.initial.photo);
  const d = props.designs.find((x) => x.code === design) ?? props.designs[0];
  const content: InviteContent = useMemo(
    () => ({ kind: props.kind, opening, bride, groom, family, dateLine: props.dateLine, message, events: props.events, photo }),
    [props.kind, opening, bride, groom, family, props.dateLine, message, props.events, photo]
  );
  const link = props.saved ? `${props.site}/invite/${props.saved.slug}` : '';
  const wa = link ? `https://wa.me/?text=${encodeURIComponent(`${bride} & ${groom} would love you to celebrate with them: ${link}`)}` : '';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form action={props.action} className="min-w-0 space-y-5">
        <input type="hidden" name="kind" value={props.kind} />
        <fieldset className="min-w-0">
          <legend className="label mb-2">Design</legend>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {[...props.designs].sort((a, b) => Number(b.code === props.initial.design) - Number(a.code === props.initial.design)).map((x) => (
              <label key={x.code} className="relative w-24 shrink-0 cursor-pointer text-center text-xs">
                <input type="radio" name="design" value={x.code} checked={x.code === design} onChange={() => setDesign(x.code)} className="peer sr-only" />
                <span className="block rounded-[6px] ring-1 ring-[var(--color-line)] peer-checked:ring-2 peer-checked:ring-[var(--color-pink)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-ink)]">
                  <InviteCard layout={x.layout} theme={x.theme} content={{ ...content, events: [], message: '', family: '' }} compact />
                </span>
                <span className="mt-1 block truncate">{x.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Bride&apos;s name *</span>
            <input name="bride" required maxLength={40} value={bride} onChange={(e) => setBride(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="label">Groom&apos;s name *</span>
            <input name="groom" required maxLength={40} value={groom} onChange={(e) => setGroom(e.target.value)} className="input" />
          </label>
        </div>
        <label className="block">
          <span className="label">Opening line</span>
          <div className="flex flex-wrap gap-1.5 pb-2" role="group" aria-label="Suggested opening lines">
            {Object.entries(CULTURES).map(([k, c]) => (
              <button key={k} type="button" className="chip" aria-pressed={opening === c.opening} onClick={() => setOpening(c.opening)}>
                {c.label}
              </button>
            ))}
          </div>
          <input name="opening" maxLength={120} value={opening} onChange={(e) => setOpening(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label">Families (optional)</span>
          <input
            name="family"
            maxLength={160}
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="input"
            placeholder="Daughter of Mrs and Mr Kaur · Son of Mrs and Mr Mehta"
          />
        </label>
        {props.kind === 'card' ? (
          <label className="block">
            <span className="label">Message</span>
            <textarea name="message" rows={3} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} className="input" />
          </label>
        ) : (
          <input type="hidden" name="message" value={message} />
        )}
        <label className="block">
          <span className="label">Your photo (optional)</span>
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPhoto(URL.createObjectURL(f));
            }}
          />
          <span className="hint">A square photo of the two of you works best. Up to 5 MB.</span>
        </label>
        <p className="hint">
          Date: {props.dateLine || 'add your wedding date under Wedding details'}. Functions:{' '}
          {props.events.length ? props.events.map((e) => e.name).join(', ') : 'add them under Guests and RSVP'}.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publish" defaultChecked={props.initial.publish} className="h-4 w-4 accent-[var(--color-pink)]" />
          Publish: anyone with the link can see it
        </label>
        <button className="btn btn-pink">Save invite</button>
      </form>

      <aside className="order-first lg:sticky lg:top-20 lg:order-none lg:self-start">
        <div className="mx-auto max-w-[260px] rounded-[8px] shadow-md ring-1 ring-[var(--color-line)] lg:max-w-none">
          <InviteCard layout={d.layout} theme={d.theme} content={content} />
        </div>
        <p className="hint mt-2 text-center">Preview updates as you type. Save to update your shared link.</p>
        <div className="mt-4 space-y-3">
          <InviteExport layout={d.layout} theme={d.theme} content={content} fileName={`${bride || 'our'}-${groom || 'wedding'}-invite`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')} />
          {props.saved?.published ? (
            <div className="flex flex-wrap gap-2">
              <a href={`/invite/${props.saved.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                Open my invite
              </a>
              <a href={wa} target="_blank" rel="noreferrer" className="btn btn-sm">
                Share on WhatsApp
              </a>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
