import Image from 'next/image';
import Link from 'next/link';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listCategories, listCities } from '@/lib/catalog';
import { Container } from './ui';
import { rememberedTown } from '@/lib/town';
import { HeaderSearch } from './HeaderSearch';

export function Wordmark({ className = '', height = 22 }: { className?: string; height?: number }) {
  return (
    <Image
      src="/brand/olready-wordmark-trim.png"
      alt="OLReady"
      width={Math.round((height * 1977) / 327)}
      height={height}
      priority
      className={className}
    />
  );
}

export async function Header() {
  const [p, cats, launched, town] = await Promise.all([currentProfile(), listCategories(sql, { activeOnly: true }), listCities(sql), rememberedTown(sql)]);
  // Menus open on the town the visitor last browsed, else on India-wide pages.
  const base = town?.slug ?? 'india';
  const cities = town && !launched.some((c) => c.id === town.id) ? [town, ...launched] : launched;
  const home = !p
    ? null
    : STAFF_ROLES.includes(p.role)
      ? { href: '/ops', label: 'Ops console' }
      : p.role === 'vendor'
        ? { href: '/vendor', label: 'My business' }
        : { href: '/me', label: 'My wedding' };
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-white">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="OLReady home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
          <details className="group relative">
            <summary className="cursor-pointer list-none hover:text-[var(--color-pink)]">Vendors</summary>
            <div className="absolute left-0 top-8 w-64 rounded-xl border border-[var(--color-line)] bg-white p-2 shadow-lg">
              {cats.map((c) => (
                <Link key={c.slug} href={`/vendors/${base}/${c.slug}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-tint)]">
                  {c.plural_name}
                </Link>
              ))}
              <Link href="/vendors/india" className="block rounded-lg px-3 py-2 text-[var(--color-pink)]">
                {town ? `All of India, not just ${town.name}` : 'All towns'}
              </Link>
            </div>
          </details>
          <Link href="/ideas" className="hover:text-[var(--color-pink)]">
            Ideas
          </Link>
          <Link href="/invitations" className="hover:text-[var(--color-pink)]">
            E-invites
          </Link>
          <Link href="/real-weddings" className="hover:text-[var(--color-pink)]">
            Real weddings
          </Link>
          <Link href="/blog" className="hover:text-[var(--color-pink)]">
            Guides
          </Link>
          <Link href="/for-vendors" className="hover:text-[var(--color-pink)]">
            For vendors
          </Link>
        </nav>
        <div className="flex items-center gap-2 text-sm sm:gap-3">
          <HeaderSearch cities={cities.map((c) => ({ slug: c.slug, name: c.name }))} defaultCity={town?.slug} />
          {home ? (
            <Link href={home.href} className="font-semibold">
              {home.label}
            </Link>
          ) : (
            <Link href="/login" className="font-semibold">
              Sign in
            </Link>
          )}
          <Link href="/enquire" className="btn btn-pink btn-sm">
            Get quotes
          </Link>
        </div>
      </Container>
      <nav className="no-scrollbar flex gap-2 overflow-x-auto border-t border-[var(--color-line)] px-4 py-2 text-sm md:hidden" aria-label="Categories">
        {cats.map((c) => (
          <Link key={c.slug} href={`/vendors/${base}/${c.slug}`} className="chip">
            {c.plural_name}
          </Link>
        ))}
        <Link href="/ideas" className="chip">
          Ideas
        </Link>
        <Link href="/invitations" className="chip">
          E-invites
        </Link>
        <Link href="/real-weddings" className="chip">
          Real weddings
        </Link>
        <Link href="/blog" className="chip">
          Guides
        </Link>
      </nav>
    </header>
  );
}

export async function Footer() {
  const [cats, cities] = await Promise.all([listCategories(sql, { activeOnly: true }), listCities(sql)]);
  const col = 'mt-2 space-y-1.5 text-sm text-[var(--color-muted)]';
  return (
    <footer className="mt-16 bg-[var(--color-tint)]">
      <Container className="py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Wordmark height={20} />
            <p className="mt-3 max-w-xs text-sm text-[var(--color-muted)]">
              Your Smart Beauty Club. Verified wedding vendors in towns across India, with every request checked on a call.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href="/enquire" className="btn btn-pink btn-sm">
                Get verified quotes
              </Link>
              <Link href="/for-vendors" className="btn btn-ghost btn-sm">
                List your business
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Vendors across India</h2>
            <ul className={col}>
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/vendors/india/${c.slug}`} className="hover:text-[var(--color-ink)]">
                    {c.plural_name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Towns</h2>
            <ul className={col}>
              {cities.slice(0, 14).map((c) => (
                <li key={c.slug}>
                  <Link href={`/vendors/${c.slug}`} className="hover:text-[var(--color-ink)]">
                    Wedding vendors in {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/vendors/india" className="font-medium text-[var(--color-ink)] hover:underline">
                  Every town
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Plan</h2>
            <ul className={col}>
              {[
                ['/directory#costs', 'Wedding costs'],
                ['/ideas', 'Ideas'],
                ['/blog', 'Guides'],
                ['/real-weddings', 'Real weddings'],
                ['/invitations', 'E-invites'],
                ['/look', 'Search by photo'],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-[var(--color-ink)]">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-5 text-xs text-[var(--color-muted)]">
          <p>An enquiry is a chance to connect with a vendor, not a confirmed booking. Support Monday to Saturday, 10:00 to 18:30 IST.</p>
          <nav aria-label="More" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/directory">All wedding vendor pages</Link>
            <Link href="/for-vendors">For vendors</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refunds">Refunds</Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
