import type { City } from '@/lib/catalog';
import { CULTURES } from '@/lib/inviteDesign';
import { submitRealWeddingAction } from '@/lib/actions/content';
import { Card, Field } from './ui';
import { PhotoInput } from './PhotoInput';

export function RealWeddingForm({ cities, backPath, defaultVendorSlug }: { cities: City[]; backPath: string; defaultVendorSlug?: string }) {
  return (
    <Card>
      <h2 className="font-semibold">Share a real wedding</h2>
      <p className="hint">Published after our team checks it. Every vendor you tag gets a link from the story.</p>
      <form action={submitRealWeddingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="_back" value={backPath} />
        <Field label="Couple names *">
          <input name="couple_names" required className="input" placeholder="Isha & Dev" />
        </Field>
        <Field label="Title *">
          <input name="title" required className="input" placeholder="A winter wedding in Chandigarh" />
        </Field>
        <Field label="City">
          <select name="city_id" className="input">
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wedding date">
          <input name="wedding_date" type="date" className="input" />
        </Field>
        <Field label="Culture">
          <select name="culture" className="input" defaultValue="generic">
            {Object.entries(CULTURES).map(([k, c]) => (
              <option key={k} value={k}>
                {k === 'generic' ? 'Mixed or other' : c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Story">
            <textarea name="story" rows={4} className="input" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <PhotoInput name="photos" multiple label="Photos (the first is the cover)" />
        </div>
        <Field label="Vendors (OLReady profile links)" hint="Separate with spaces or commas.">
          <input name="vendor_slugs" className="input" defaultValue={defaultVendorSlug} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Or photo links" hint="One per line.">
            <textarea name="photo_urls" rows={3} className="input" />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-[var(--color-pink)]" />
          The couple agreed to publish these photos and their names on OLReady, and the photographer allows it.
        </label>
        <button className="btn btn-pink sm:col-span-2 sm:justify-self-start">Submit for review</button>
      </form>
    </Card>
  );
}
