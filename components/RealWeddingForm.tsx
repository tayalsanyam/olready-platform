import type { City } from '@/lib/catalog';
import { submitRealWeddingAction } from '@/lib/actions/content';
import { Card, Field } from './ui';

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
        <div className="sm:col-span-2">
          <Field label="Story">
            <textarea name="story" rows={4} className="input" />
          </Field>
        </div>
        <Field label="Cover photo link">
          <input name="cover_image_url" className="input" placeholder="https://…" />
        </Field>
        <Field label="Vendors (OLReady profile links)" hint="Separate with spaces or commas.">
          <input name="vendor_slugs" className="input" defaultValue={defaultVendorSlug} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="More photo links" hint="One per line.">
            <textarea name="photo_urls" rows={3} className="input" />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-[var(--color-gold)]" />
          The couple agreed to publish these photos and their names on OLReady, and the photographer allows it.
        </label>
        <button className="btn btn-gold sm:col-span-2 sm:justify-self-start">Submit for review</button>
      </form>
    </Card>
  );
}
