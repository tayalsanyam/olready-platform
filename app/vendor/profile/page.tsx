import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { fieldsFor } from '@/lib/catalog';
import { vendorMedia } from '@/lib/vendors';
import { addMedia, removeMedia, saveVendorPlaceAction, saveVendorProfile, setCoverAction } from '@/lib/actions/vendor';
import { citiesByIds, getCity } from '@/lib/catalog';
import { getLocality } from '@/lib/locations';
import { PlacePicker, TownChips } from '@/components/PlacePicker';
import { vendorTagPhoto } from '@/lib/actions/ideas';
import { vendorKnownForAction } from '@/lib/actions/look';
import { topicTags } from '@/lib/ideas';
import { SPACE_KINDS, spacesFor } from '@/lib/venueSpaces';
import { vendorAddSpace, vendorRemoveSpace } from '@/lib/actions/vendorTools';
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
  const [topic] = await sql<{ id: number; slug: string; name: string }[]>`
    select id, slug, name from mkt.idea_topics where category_id = ${vendor.category_id}`;
  const tags = topic ? await topicTags(sql, topic.id) : [];
  const [cat] = await sql<{ slug: string }[]>`select slug from mkt.categories where id = ${vendor.category_id}`;
  const spaces = cat?.slug === 'venues' ? await spacesFor(sql, vendor.id) : null;
  const [town, area, serving] = await Promise.all([getCity(sql, vendor.city_id), getLocality(sql, vendor.locality_id), citiesByIds(sql, vendor.service_city_ids)]);
  const t = (c: { id: number; name: string; state: string }) => ({ id: c.id, name: c.name, state: c.state });
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="whatsapp_alerts" defaultChecked={vendor.whatsapp_alerts} className="h-4 w-4 accent-[var(--color-pink)]" />
          WhatsApp me about new leads, messages and accepted quotes, on the business phone above. Reply STOP any time.
        </label>
        <button className="btn btn-pink">Save profile</button>
      </form>

      <div className="scroll-mt-24" id="where" />
      <Card className="mt-6">
        <h2 className="font-semibold">Where you are</h2>
        <p className="hint">
          Brides search by town and area. {cat?.slug === 'venues' ? 'Venues show the full address and a map.' : 'Show your full address only if brides visit you, for example a studio or a store.'}
        </p>
        <form action={saveVendorPlaceAction} className="mt-3 space-y-4">
          <PlacePicker
            withArea
            required
            label="Base town or city *"
            town={town ? t(town) : null}
            area={area ? { id: area.id, name: area.name, pincode: vendor.pincode ?? area.pincode } : vendor.pincode ? { id: null, name: '', pincode: vendor.pincode } : null}
          />
          <Field label="Street address" hint="Building, street or landmark. Shown only if you tick the box below.">
            <input name="address_line" className="input" maxLength={200} defaultValue={vendor.address_line ?? ''} placeholder="SCO 12, Madhya Marg" />
          </Field>
          <Field label="Google Maps link (optional)" hint="Open your place in Google Maps, tap Share, and paste the link here.">
            <input name="maps_url" className="input" inputMode="url" maxLength={500} defaultValue={vendor.maps_url ?? ''} placeholder="https://maps.app.goo.gl/…" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="address_public" defaultChecked={vendor.address_public ?? cat?.slug === 'venues'} className="h-4 w-4 accent-[var(--color-pink)]" />
            Show my full address and map on my page
          </label>
          <div>
            <p className="label">Towns you work in</p>
            <TownChips base={town ? t(town) : null} towns={serving.map(t)} />
          </div>
          <button className="btn">Save address</button>
        </form>
      </Card>

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

      {spaces ? (
        <Card className="mt-6">
          <h2 className="font-semibold">Halls and lawns</h2>
          <p className="hint">List each space separately so families can see which one fits their guest count.</p>
          {spaces.length ? (
            <ul className="mt-3 divide-y divide-[var(--color-line)] text-sm">
              {spaces.map((sp) => (
                <li key={sp.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <b>{sp.name}</b> <span className="text-[var(--color-muted)]">{SPACE_KINDS[sp.kind]}</span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {sp.seating ? `${sp.seating} seated` : ''}
                      {sp.seating && sp.floating ? ', ' : ''}
                      {sp.floating ? `${sp.floating} floating` : ''}
                    </span>
                  </span>
                  <form action={vendorRemoveSpace}>
                    <input type="hidden" name="id" value={sp.id} />
                    <button className="btn btn-ghost btn-sm">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={vendorAddSpace} className="mt-3 grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto] sm:items-end">
            <Field label="Name">
              <input name="name" required maxLength={60} className="input" placeholder="Crystal Hall" />
            </Field>
            <Field label="Kind">
              <select name="kind" className="input">
                {Object.entries(SPACE_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Seated">
              <input name="seating" type="number" min={1} max={20000} className="input" />
            </Field>
            <Field label="Floating">
              <input name="floating" type="number" min={1} max={20000} className="input" />
            </Field>
            <button className="btn btn-sm">Add</button>
          </form>
        </Card>
      ) : null}

      {topic && tags.length ? (
        <Card className="mt-6">
          <h2 className="font-semibold">What you are known for</h2>
          <p className="hint">Pick up to 6 styles. Brides who search by photo or style see you first for these.</p>
          <form action={vendorKnownForAction} className="mt-3">
            <fieldset className="flex flex-wrap gap-1.5" aria-label="Styles you are known for">
              {tags.map((t) => (
                <label key={t.slug} className="chip cursor-pointer has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                  <input type="checkbox" name="known_for" value={t.slug} defaultChecked={(vendor.known_for ?? []).includes(t.slug)} className="sr-only" />
                  {t.label}
                </label>
              ))}
            </fieldset>
            <button className="btn btn-ghost btn-sm mt-3">Save</button>
          </form>
        </Card>
      ) : null}

      {media.length && topic ? (
        <Card className="mt-6">
          <h2 className="font-semibold">Help brides find your work</h2>
          <p className="hint">
            Your photos also appear in <Link className="underline" href={`/ideas/${topic.slug}`}>{topic.name}</Link> ideas, credited to you
            with a link to your profile. A short caption and the right styles put them in front of brides searching for that look.
          </p>
          <ul className="mt-3 divide-y divide-[var(--color-line)]">
            {media.map((m, i) => (
              <li key={m.id} className="py-3">
                <form action={vendorTagPhoto} className="flex gap-3">
                  <input type="hidden" name="media_id" value={m.id} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      name="caption"
                      defaultValue={m.caption}
                      maxLength={140}
                      placeholder="Caption, e.g. Pastel lehenga look for a day wedding"
                      className="input py-1"
                      aria-label={`Caption for photo ${i + 1}`}
                    />
                    <fieldset className="flex flex-wrap gap-1.5" aria-label={`Styles for photo ${i + 1}`}>
                      {tags.map((t) => (
                        <label key={t.slug} className="chip cursor-pointer has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                          <input type="checkbox" name="tags" value={t.slug} defaultChecked={m.tags.includes(t.slug)} className="sr-only" />
                          {t.label}
                        </label>
                      ))}
                    </fieldset>
                    <button className="btn btn-ghost btn-sm">Save</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
