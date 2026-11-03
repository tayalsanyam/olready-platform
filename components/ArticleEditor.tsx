'use client';

import { useState } from 'react';
import { Markdown } from '@/lib/markdown';

/** Markdown editor with a live preview, side by side on wide screens and as tabs on phones. */
export function ArticleBody({ initial }: { initial: string }) {
  const [body, setBody] = useState(initial);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const words = body.split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="label">Article</span>
        <div className="flex gap-1 lg:hidden" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'write'} className="chip" aria-current={tab === 'write'} onClick={() => setTab('write')}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className="chip" aria-current={tab === 'preview'} onClick={() => setTab('preview')}>
            Preview
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={tab === 'write' ? '' : 'hidden lg:block'}>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={26} className="input font-mono text-sm" aria-label="Article text" />
          <p className="hint mt-1">
            {words} words, about {Math.max(1, Math.round(words / 200))} min read. Use # for headings, - for lists, **bold**, [link](https://…), ![caption](image link).
          </p>
        </div>
        <div className={`rounded-[14px] border border-[var(--color-line)] p-4 ${tab === 'preview' ? '' : 'hidden lg:block'}`}>
          {body.trim() ? <Markdown source={body} /> : <p className="text-sm text-[var(--color-muted)]">The preview appears here.</p>}
        </div>
      </div>
    </div>
  );
}
