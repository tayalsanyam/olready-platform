import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { fieldsFor } from '@/lib/catalog';
import { vendorMedia } from '@/lib/vendors';
import { addMedia, removeMedia, saveVendorProfile, setCoverAction } from '@/lib/actions/vendor';
import { PhotoInput } from '@/components/PhotoInput';
import { AttributeInputs } from '@/components/AttributeInputs';
import { Badge, Card, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const statusText: Record<string, string> = {
  draft: 'Draft: finish your details and save to send it for review.',
  pending_review: 'Waiting for review by our team. We check details and work samples before a profile goes live.',
  live: 'Live: brides can find you.',
  suspended: 'Suspended. Contact support.',
  closed: 'Closed.',
};

export default async function ProfilePage({ searchParams }: P) {
  const q = await searchParams;
  const { profile, vendor } = await requireVendor('/vendor/profile');
  const [{ notify_email: notify }] = await sql<{ notify_email: boolean }[]>`select notify_email from mkt.profiles where id = ${profile.id}`;
  const [fields, media] = await Promise.all([fieldsFor(sql, vendor.category_id), vendorMedia(sql, vendor.id)]);
  return (
    <>
      <PageTitle
        title={vendor.business_name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={vendor.status === 'live' ? 'ok' : 'warn'}>{vendor.status.replace('_', ' ')}</Badge>
            {vendor.verified_at ? <Badge tone="ok">Verified</Badge> : null}
            {vendor.assured ? <Badge tone="gold">Assured</Badge> : null}
            <span>{statusText[vendor.status]}</span>
          </span>
        }
        action={
          <Link href={`/v/${vendor.slug}`} className="btn btn-ghost btn-sm">
            View my page
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <form action={saveVendorProfile} className="space-y-4">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name *">
            <input name="business_name" required className="input" defaultValue={vendor.business_name} />
          </Field>
          <Field label={`Starting price (${vendor.price_unit})`}>
            <input name="starting_price_inr" className="input" inputMode="numeric" defaultValue={vendor.starting_price_inr ?? ''} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="One line about your work">
              <input name="tagline" className="input" maxLength={140} defaultValue={vendor.tagline} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="About">
              <textarea name="about" rows={5} className="input" defaultValue={vendor.about} />
            </Field>
          </div>
          <Field label="Years of experience">
            <input name="years_experience" className="input" inputMode="numeric" defaultValue={vendor.years_experience ?? ''} />
          </Field>
          <input type="hidden" name="cover_image_url" value={vendor.cover_image_url ?? ''} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Details brides filter by</h2>
          <AttributeInputs fields={fields} values={vendor.attributes} />
        </Card>
        <Card className="grid gap-4 sm:grid-cols-2">
          <p className="hint sm:col-span-2">Private to OLReady staff. Brides never see these on your page.</p>
          <Field label="Phone">
            <input name="phone" className="input" defaultValue={vendor.phone ?? ''} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" defaultValue={vendor.email ?? ''} />
          </Field>
          <Field label="Instagram">
            <input name="instagram" className="input" defaultValue={vendor.instagram ?? ''} />
          </Field>
          <Field label="Website">
            <input name="website" className="input" defaultValue={vendor.website ?? ''} />
          </Field>
        </Card>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify_email" defaultChecked={notify} className="h-4 w-4 accent-[var(--color-pink)]" />
          Email me about new leads, messages and accepted quotes
        </label>
        <button className="btn btn-pink">Save profile</button>
      </form>

      <Card className="mt-6">
        <h2 className="font-semibold">Work photos</h2>
        <p className="hint">Only photos you own or have the right to use. Your first photo becomes the cover.</p>
        <form action={addMedia} className="mt-3 space-y-3">
          <PhotoInput name="photos" multiple label="Upload photos" />
          <details>
            <summary className="hint cursor-pointer">Or paste links</summary>
            <textarea name="urls" rows={2} className="input mt-1" placeholder="https://…" />
          </details>
          <button className="btn btn-sm">Add photos</button>
        </form>
        {media.length ? (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {media.map((m) => (
              <li key={m.id} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" className="h-full w-full object-cover" />
                {vendor.cover_image_url === m.url ? (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[0.7rem] text-white">Cover</span>
                ) : (
                  <form action={setCoverAction} className="absolute bottom-1 left-1">
                    <input type="hidden" name="media_id" value={m.id} />
                    <button className="rounded bg-white/90 px-1.5 text-[0.7rem] font-semibold">Make cover</button>
                  </form>
                )}
                <form action={removeMedia} className="absolute right-1 top-1">
                  <input type="hidden" name="media_id" value={m.id} />
                  <button className="btn btn-sm btn-danger px-2 py-0.5" aria-label="Remove photo">
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
