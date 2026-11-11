'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mergeSavedVendors } from '@/lib/actions/bride';

/** Once she is signed in with a wedding set up, the vendors she saved as a visitor join her shortlist. */
export function MergeSaved() {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    let slugs: string[] = [];
    try {
      slugs = (JSON.parse(localStorage.getItem('olr_saved') ?? '[]') as { slug: string }[]).map((s) => s.slug);
    } catch {
      return;
    }
    if (!slugs.length) return;
    void mergeSavedVendors(slugs).then((r) => {
      if (r.wait) return;
      try {
        localStorage.removeItem('olr_saved');
      } catch {
        /* nothing */
      }
      if (r.merged) {
        setN(r.merged);
        router.refresh();
      }
    });
  }, [router]);
  if (!n) return null;
  return (
    <p role="status" className="arrive mb-4 rounded-xl border border-[#bfe3cd] bg-[#e3f4ea] px-3.5 py-2.5 text-sm text-[var(--color-ok)]">
      {n === 1 ? 'The vendor you saved earlier is' : `The ${n} vendors you saved earlier are`} now in your shortlist.
    </p>
  );
}
