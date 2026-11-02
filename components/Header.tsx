import Link from 'next/link';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { Container } from './ui';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark relative inline-block text-lg ${className}`} aria-label="OLReady">
      <span className="relative">
        O
        <span aria-hidden className="absolute -bottom-1 left-1/2 h-1 w-2 -translate-x-1/2 rounded-b-full bg-[var(--color-gold)]" />
      </span>
      LREAD
      <span className="relative">
        Y
        <span aria-hidden className="absolute -top-1 left-1/2 h-1 w-2 -translate-x-1/2 rounded-t-full bg-[var(--color-gold)]" />
      </span>
    </span>
  );
}

export async function Header() {
  const p = await currentProfile();
  const home = !p
    ? null
    : STAFF_ROLES.includes(p.role)
      ? { href: '/ops', label: 'Ops console' }
      : p.role === 'vendor'
        ? { href: '/vendor', label: 'My business' }
        : { href: '/me', label: 'My wedding' };
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/vendors" className="hidden sm:inline">
            Vendors
          </Link>
          <Link href="/real-weddings" className="hidden sm:inline">
            Real weddings
          </Link>
          {home ? (
            <Link href={home.href} className="font-semibold">
              {home.label}
            </Link>
          ) : (
            <Link href="/login" className="font-semibold">
              Sign in
            </Link>
          )}
          <Link href="/enquire" className="btn btn-gold btn-sm">
            Get quotes
          </Link>
        </nav>
      </Container>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--color-line)] bg-white">
      <Container className="grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <Wordmark />
          <p className="mt-2 text-[var(--color-muted)]">Your Smart Beauty Club. Verified wedding vendors across the Tricity.</p>
        </div>
        <div className="space-y-1">
          <Link href="/vendors" className="block">
            Find vendors
          </Link>
          <Link href="/real-weddings" className="block">
            Real weddings
          </Link>
          <Link href="/vendor" className="block">
            For vendors
          </Link>
        </div>
        <p className="text-[var(--color-muted)]">
          An enquiry is a chance to connect with a vendor, not a confirmed booking. Support Monday to Saturday, 10:00 to 18:30 IST.
        </p>
      </Container>
    </footer>
  );
}
