import { PlacePicker } from '@/components/PlacePicker';
import { redirect } from 'next/navigation';
import { AcceptTerms } from '@/components/PolicyPage';
import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { fieldsFor, listCategories, listCities } from '@/lib/catalog';
import { vendorForOwner } from '@/lib/vendors';
import { onboardVendor } from '@/lib/actions/vendor';
import { AttributeInputs } from '@/components/AttributeInputs';
import { Card, Field, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'List your business', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Onboard({ searchParams }: P) {
  const q = await searchParams;
  const profile = await requireProfile('/vendor/onboard');
  if (await vendorForOwner(sql, profile.id)) redirect('/vendor');
  const [cats, cities] = await Promise.all([listCategories(sql, { activeOnly: true }), listCities(sql)]);
  const chosen = cats.find((c) => c.slug === sp(q.category));
  const fields = chosen ? await fieldsFor(sql, chosen.id) : [];
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="List your business on OLReady" sub="Free to list. You pay only for verified leads you choose to unlock." />
      <Notice error={q.error} />
      {!chosen ? (
        <Card>
          <h2 className="font-semibold">What do you do?</h2>
          <form className="mt-3 grid gap-2 sm:grid-cols-2">
            {cats.map((c) => (
              <button key={c.slug} name="category" value={c.slug} className="btn btn-ghost justify-start">
                {c.name}
              </button>
            ))}
          </form>
        </Card>
      ) : (
        <form action={onboardVendor} className="space-y-4">
          <input type="hidden" name="category_id" value={chosen.id} />
          <Card className="grid gap-4 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm">
              Category: <b>{chosen.name}</b>{' '}
              <a href="/vendor/onboard" className="underline">
                change
              </a>
            </p>
            <Field label="Business name *">
              <input name="business_name" required className="input" />
            </Field>
            <Field label="Your name">
              <input name="owner_name" className="input" defaultValue={profile.full_name} />
            </Field>
            <PlacePicker required label="Base town or city *" townHint="Anywhere in India. You can add the towns you travel to later." quick={cities.map((c) => ({ id: c.id, name: c.name, state: c.state }))} />
            <Field label={`Starting price (${chosen.price_unit})`}>
              <input name="starting_price_inr" className="input" inputMode="numeric" placeholder="₹" />
            </Field>
            <Field label="Business phone" hint="Never shown on your profile.">
              <input name="phone" className="input" inputMode="tel" />
            </Field>
            <Field label="Instagram handle" hint="Never shown on your profile.">
              <input name="instagram" className="input" placeholder="@" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="One line about your work">
                <input name="tagline" className="input" maxLength={140} />
              </Field>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Details brides filter by</h2>
            <AttributeInputs fields={fields} />
          </Card>
          <AcceptTerms refunds={false} />
          <button className="btn btn-pink">Create my profile</button>
        </form>
      )}
    </div>
  );
}
