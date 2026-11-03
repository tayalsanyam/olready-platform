import { after } from 'next/server';
import { bump, visitorKey } from '@/lib/analytics';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { formatInr, listCategories, listCities } from '@/lib/catalog';
import { getVendorBySlug } from '@/lib/vendors';
import { weddingFor } from '@/lib/weddings';
import { submitEnquiry } from '@/lib/actions/public';
import { Card, Container, Field, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Get verified quotes', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Enquire({ searchParams }: P) {
  const q = await searchParams;
  const [cats, cities, profile] = await Promise.all([listCategories(sql, { activeOnly: true }), listCities(sql), currentProfile()]);
  const vendor = sp(q.vendor) ? await getVendorBySlug(sql, sp(q.vendor)!) : null;
  if (vendor?.status === 'live' && (await visitorKey())) after(() => bump(sql, [vendor.id], 'quote_starts').catch(() => undefined));
  const wedding = profile ? await weddingFor(sql, profile.id) : null;
  // One category or several (from Ask OLReady: ?category=venues,caterers&guests=400).
  const preCats = new Set((sp(q.category) ?? '').split(',').filter(Boolean));
  const preGuests = Number(sp(q.guests)) > 0 ? Math.min(20000, Math.round(Number(sp(q.guests)))) : undefined;
  const preCity = cities.find((c) => c.slug === sp(q.city))?.id ?? vendor?.city_id ?? wedding?.city_id ?? cities[0]?.id;
  const self = `/enquire?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v)]).filter(([k]) => k !== 'error'))}`;
  return (
    <Container className="max-w-3xl">
      <PageTitle
        title={vendor ? `Request a quote from ${vendor.business_name}` : 'Get verified quotes'}
        sub={
          vendor
            ? 'We confirm your details on a short call, then pass your request to this vendor only.'
            : 'Tick everything you still need. One short call from our team, then verified vendors in each category reach you.'
        }
      />
      <Notice error={q.error} />
      <form action={submitEnquiry} className="space-y-5">
        <input type="hidden" name="_back" value={self} />
        <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
          <label>
            Company
            <input name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {vendor ? <input type="hidden" name="vendor" value={vendor.slug} /> : null}
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name *">
            <input name="name" required className="input" defaultValue={profile?.full_name ?? ''} autoComplete="name" />
          </Field>
          <Field label="Mobile number *" hint="Used for one verification call. Vendors see it only after you are verified.">
            <input name="phone" required className="input" inputMode="tel" autoComplete="tel" defaultValue={profile?.phone ?? ''} />
          </Field>
          <Field label="Email" hint="Sign in later with this email to track replies and quotes.">
            <input name="email" type="email" className="input" defaultValue={profile?.email ?? ''} autoComplete="email" />
          </Field>
          <Field label="Wedding date">
            <input name="event_date" type="date" className="input" defaultValue={wedding?.wedding_date ?? ''} />
          </Field>
          <Field label="Guests (approx.)" hint="Venues and caterers price per plate, so this helps them quote.">
            <input name="guest_count" type="number" min={1} max={20000} inputMode="numeric" className="input" defaultValue={preGuests} />
          </Field>
          <Field label="City *">
            <select name="city_id" className="input" defaultValue={preCity} required>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </Card>
        {vendor ? (
          <Card>
            <Field
              label={`Your budget for ${vendor.category_name.toLowerCase()} (optional)`}
              hint={vendor.starting_price_inr != null ? `${vendor.business_name} starts at ${formatInr(vendor.starting_price_inr)} ${vendor.price_unit}.` : undefined}
            >
              <input name={`budget_${vendor.category_id}`} className="input" inputMode="numeric" placeholder="₹" />
            </Field>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="also_others" className="mt-0.5 h-4 w-4 accent-[var(--color-pink)]" />
              <span>
                Also let other verified {vendor.category_name.toLowerCase()}s send me quotes, so I can compare.{' '}
                <span className="text-[var(--color-muted)]">{vendor.business_name} still sees your request first.</span>
              </span>
            </label>
          </Card>
        ) : (
          <Card>
            <h2 className="font-semibold">What do you need?</h2>
            <p className="hint">Add a budget if you have one. It helps us send vendors who fit.</p>
            <ul className="mt-3 divide-y divide-[var(--color-line)]">
              {cats.map((c) => (
                <li key={c.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_200px]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="category_id" value={c.id} defaultChecked={preCats.has(c.slug)} className="h-4 w-4 accent-[var(--color-pink)]" />
                    <span>{c.plural_name}</span>
                  </label>
                  <input name={`budget_${c.id}`} className="input" inputMode="numeric" placeholder={`Budget ₹ (${c.price_unit})`} aria-label={`Budget for ${c.plural_name}`} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="whatsapp" className="mt-0.5 h-4 w-4 accent-[var(--color-pink)]" />
          <span>Send me updates about this request on WhatsApp</span>
        </label>
        <button className="btn btn-pink w-full sm:w-auto">Send my request</button>
        <p className="hint">An enquiry is a chance to connect with vendors, not a confirmed booking.</p>
      </form>
    </Container>
  );
}
