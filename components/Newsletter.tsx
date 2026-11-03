import { subscribeAction } from '@/lib/actions/content2';

/** Email sign-up for wedding ideas. The hidden "company" field catches bots. */
export function Newsletter({ backPath, source = 'blog' }: { backPath: string; source?: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--color-pink-soft)] p-5">
      <h2 className="text-lg font-semibold">Wedding ideas in your inbox</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">New guides, real Tricity weddings and ideas, now and then. Unsubscribe any time.</p>
      <form action={subscribeAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="_back" value={backPath} />
        <input type="hidden" name="source" value={source} />
        <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <input name="email" type="email" required placeholder="Your email" aria-label="Your email" className="input min-w-0 flex-1 bg-white" />
        <button className="btn btn-pink">Sign up</button>
      </form>
    </div>
  );
}
