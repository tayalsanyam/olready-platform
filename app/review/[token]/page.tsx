import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { reviewRequestByToken } from '@/lib/vendorTools';
import { submitInvitedReviewAction } from '@/lib/actions/vendorTools';
import { Card, Container, Notice, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Write a review', robots: { index: false } };
type P = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[]>> };

/** Masks an email so the page confirms who the link is for without showing the whole address. */
const mask = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + '*'.repeat(Math.min(b.length, 6)) + c);

export default async function InvitedReview({ params, searchParams }: P) {
  const { token } = await params;
  const q = await searchParams;
  const r = await reviewRequestByToken(sql, token);
  if (!r || r.status === 'cancelled') notFound();
  const me = await currentProfile();
  const done = r.status === 'used';
  const wrong = me && (me.email ?? '').toLowerCase() !== r.client_email;
  return (
    <Container className="max-w-lg">
      <Card className="p-6">
        <p className="text-sm text-[var(--color-muted)]">Review for</p>
        <h1 className="text-2xl font-semibold">{r.vendor_name}</h1>
        <div className="mt-3">
          <Notice error={sp(q.error)} ok={sp(q.ok)} />
        </div>
        {done ? (
          <p className="mt-3">
            Thank you, your review is in. {r.review_status === 'published' ? 'It is live on ' : 'It appears on '}
            <Link className="underline" href={`/v/${r.vendor_slug}`}>
              their profile
            </Link>
            {r.review_status === 'published' ? '.' : ' once our team has checked it.'}
          </p>
        ) : !me ? (
          <div className="mt-3 space-y-3">
            <p>
              {r.vendor_name} asked {r.client_name} for a review. Sign in with {mask(r.client_email)} to write it; we send a one-time code
              to that email so only you can use this link.
            </p>
            <Link href={`/login?next=${encodeURIComponent(`/review/${token}`)}`} className="btn btn-pink w-full">
              Sign in to write the review
            </Link>
          </div>
        ) : wrong ? (
          <p className="mt-3">
            This link was sent to {mask(r.client_email)}, but you are signed in as {me.email}. Sign out and sign in with the email the link was sent
            to.
          </p>
        ) : (
          <form action={submitInvitedReviewAction} className="mt-4 space-y-3">
            <input type="hidden" name="token" value={token} />
            {(['rating_artist', 'rating_service'] as const).map((k) => (
              <fieldset key={k} className="flex items-center justify-between gap-2">
                <legend className="sr-only">{k === 'rating_artist' ? 'Their work' : 'Service and punctuality'}</legend>
                <span className="text-sm">{k === 'rating_artist' ? 'Their work' : 'Service and punctuality'}</span>
                <span className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer text-sm">
                      <input type="radio" name={k} value={n} required className="peer sr-only" aria-label={`${n} out of 5`} />
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] peer-checked:border-[var(--color-pink)] peer-checked:bg-[var(--color-pink)] peer-checked:text-white">
                        {n}
                      </span>
                    </label>
                  ))}
                </span>
              </fieldset>
            ))}
            <textarea name="body" rows={4} maxLength={3000} className="input" placeholder="What should other brides know?" aria-label="Your review" />
            <button className="btn btn-pink w-full">Send review</button>
            <p className="hint">Our team checks reviews from invitations before they show. Be honest: it helps other families.</p>
          </form>
        )}
      </Card>
    </Container>
  );
}
