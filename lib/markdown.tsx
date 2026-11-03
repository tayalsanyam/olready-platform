import type { ReactNode } from 'react';

// A small, safe Markdown subset for articles. Nothing is ever injected as HTML: every
// piece becomes a React element, and links and images only accept http(s) or site paths.
//   # ## ###  headings      - or * lists     1. ordered lists     > quotes
//   **bold**  *italic*      [text](url)      ![alt](url) images  --- rule

const safeUrl = (u: string) => (/^(https?:\/\/|\/(?!\/))/i.test(u.trim()) ? u.trim() : null);

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${key}${n++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={`${key}${n++}`}>{m[3]}</em>);
    else if (m[4]) {
      const href = safeUrl(m[5]);
      out.push(
        href ? (
          <a key={`${key}${n++}`} href={href} className="underline underline-offset-4" {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener nofollow' } : {})}>
            {m[4]}
          </a>
        ) : (
          m[4]
        )
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'mt-8 text-2xl font-semibold' : level === 2 ? 'mt-8 text-xl font-semibold' : 'mt-6 text-lg font-semibold';
      blocks.push(level === 1 ? <h2 key={k++} className={cls}>{inline(h[2])}</h2> : level === 2 ? <h2 key={k++} className={cls}>{inline(h[2])}</h2> : <h3 key={k++} className={cls}>{inline(h[2])}</h3>);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(l)) {
      blocks.push(<hr key={k++} className="my-8 border-[var(--color-line)]" />);
      i++;
      continue;
    }
    const img = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      const src = safeUrl(img[2]);
      if (src)
        blocks.push(
          <figure key={k++} className="my-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={img[1]} className="w-full rounded-[14px]" loading="lazy" />
            {img[1] ? <figcaption className="mt-2 text-center text-sm text-[var(--color-muted)]">{img[1]}</figcaption> : null}
          </figure>
        );
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k++} className="my-6 border-l-4 border-[var(--color-pink)] pl-4 text-lg italic">
          {inline(q.join(' '))}
        </blockquote>
      );
      continue;
    }
    if (/^[-*]\s+/.test(l) || /^\d+[.)]\s+/.test(l)) {
      const ordered = /^\d/.test(l);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/).test(lines[i])) items.push(lines[i++].replace(ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k++} className={`my-4 space-y-1.5 pl-6 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${j}`)}</li>
          ))}
        </List>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|[-*]\s|\d+[.)]\s|---|!\[)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++} className="my-4 leading-relaxed">
        {inline(para.join(' '))}
      </p>
    );
  }
  return <div className="max-w-[68ch] text-[1.05rem]">{blocks}</div>;
}

export const readingMinutes = (s: string) => Math.max(1, Math.round(s.split(/\s+/).filter(Boolean).length / 200));
export const plainText = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`-]/g, '').replace(/\s+/g, ' ').trim();
