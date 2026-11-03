'use client';

import { type ReactNode, useState } from 'react';

/** Re-runs the invite's reveal animation by remounting the card. */
export function InviteReplay({ children }: { children: ReactNode }) {
  const [n, setN] = useState(0);
  return (
    <div>
      <div key={n}>{children}</div>
      <div className="mt-3 text-center">
        <button type="button" onClick={() => setN((x) => x + 1)} className="btn btn-ghost btn-sm bg-white/80">
          Play again
        </button>
      </div>
    </div>
  );
}
