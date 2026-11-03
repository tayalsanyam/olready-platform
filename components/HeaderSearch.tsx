'use client';

import { useState } from 'react';
import { SearchBox } from './SearchBox';
import { IconSearch } from './icons';

/** A search button in the header that opens the search box underneath it. */
export function HeaderSearch({ cities }: { cities: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close search' : 'Search'}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--color-tint)]"
      >
        <IconSearch size={18} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 border-b border-[var(--color-line)] bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto max-w-2xl">
            <SearchBox cities={cities} />
          </div>
        </div>
      ) : null}
    </>
  );
}
