'use client';

import { useEffect } from 'react';

/** Remembers the town a visitor is browsing, so menus open on it next time. No personal data. */
export function RememberTown({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      document.cookie = `olr_town=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: menus fall back to India-wide pages.
    }
  }, [slug]);
  return null;
}
