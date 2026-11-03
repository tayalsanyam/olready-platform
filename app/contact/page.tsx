import Link from 'next/link';
import { OPERATOR } from '@/lib/legal';
import { CONTACT_TOPICS } from '@/lib/contact';
import { sendContactAction } from '@/lib/actions/public';
import { currentProfile } from '@/lib/auth';
import { Card, Container, Field, Notice, sp } from '@/components/ui';
import { JsonLd } from '@/components/VendorCard';
import { siteUrl } from '@/lib/seo';

export const metadata = {
  title: 'Contact OLReady',
  description: `Talk to the OLReady team in Chandigarh about your wedding, your business listing, a payment or your data. ${OPERATOR.hours}.`,
  alternates: { canonical: '/contact' },
};
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Contact({ searchParams }: P) {
  const q = await searchParams;
  const p = await currentProfile();
  const topic = sp(q.topic) && CONTACT_TOPICS[sp(q.topic)!] ? sp(q.topic)! : p?.role === 'vendor' ? 'vendor' : 'bride';
  return (
    <Container className="max-w-5xl">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'OLReady',
          legalName: 'Katalyst Infomedia',
          url: siteUrl(),
          email: OPERATOR.email,
          telephone: OPERATOR.phone,
          address: { '@type': 'PostalAddress', streetAddress: '2nd Floor, SCO 198–199, Next 57 Coworking, Sector 17C', addressLocality: 'Chandigarh', postalCode: '160017', addressCountry: 'IN' },
          contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: OPERATOR.email, telephone: OPERATOR.phone, areaServed: 'IN', availableLanguage: ['English', 'Hindi', 'Punjabi'] }],
        }}
      />
      <h1 className="text-3xl font-semibold sm:text-4xl">Talk to us</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-muted)]">
        A real person in Chandigarh reads every message. {OPERATOR.hours}.
      </p>
      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div>
            <h2 className="font-semibold">Quickest</h2>
            <p className="mt-1 text-sm">
              <a href={`https://wa.me/${OPERATOR.whatsapp}`} className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">
                WhatsApp {OPERATOR.phone}
              </a>{' '}
              or call the same number.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Email</h2>
            <p className="mt-1 text-sm">
              <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-4">
                {OPERATOR.email}
              </a>
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Office</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{OPERATOR.address}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Katalyst Infomedia, GSTIN {OPERATOR.gstin}</p>
          </div>
          <div className="rounded-2xl bg-[var(--color-tint)] p-4 text-sm">
            <h2 className="font-semibold">Grievance Officer</h2>
            <p className="mt-1">
              {OPERATOR.grievance.name}, {OPERATOR.grievance.role}
            </p>
            <p className="text-[var(--color-muted)]">
              <a href={`mailto:${OPERATOR.grievance.email}`} className="underline underline-offset-4">
                {OPERATOR.grievance.email}
              </a>
              , {OPERATOR.grievance.phone}
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted)]">Formal grievances are acknowledged within 48 hours and addressed within seven working days.</p>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Looking for vendors? <Link href="/enquire" className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">Send one request</Link> and we
            call you. Running a business? <Link href="/for-vendors" className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">See how listing works</Link>.
          </p>
        </div>
        <Card className="p-5">
          <h2 className="font-semibold">Send us a message</h2>
          <div className="mt-3">
            <Notice error={q.error} ok={q.ok} />
          </div>
          <form action={sendContactAction} className="grid gap-3">
            <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
              <label>
                Company
                <input name="company" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Field label="Your name">
              <input name="name" required className="input" autoComplete="name" defaultValue={p?.full_name ?? ''} maxLength={80} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input name="email" type="email" className="input" autoComplete="email" defaultValue={p?.email ?? ''} />
              </Field>
              <Field label="Phone">
                <input name="phone" className="input" inputMode="tel" autoComplete="tel" />
              </Field>
            </div>
            <Field label="About">
              <select name="topic" defaultValue={topic} className="input">
                {Object.entries(CONTACT_TOPICS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Message">
              <textarea name="message" required minLength={10} rows={5} className="input" maxLength={3000} />
            </Field>
            <p className="text-xs text-[var(--color-muted)]">
              We use these details only to reply. See our <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
            </p>
            <button className="btn btn-pink justify-self-start">Send message</button>
          </form>
        </Card>
      </div>
    </Container>
  );
}
