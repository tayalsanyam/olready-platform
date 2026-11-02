import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { type Category, fieldsFor, tiersFor } from '@/lib/catalog';
import { opsDeleteField, opsSaveCategory, opsSaveField, opsSaveTier } from '@/lib/actions/ops';
import { Card, Field, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Category' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function CategoryEditor({ params, searchParams }: P) {
  const id = Number((await params).id);
  const q = await searchParams;
  await requireAdmin();
  if (!Number.isInteger(id)) notFound();
  const [c] = await sql<Category[]>`select * from mkt.categories where id = ${id}`;
  if (!c) notFound();
  const [fields, tiers] = await Promise.all([fieldsFor(sql, id), tiersFor(sql, id)]);
  return (
    <>
      <PageTitle title={c.plural_name} sub={`/vendors/<city>/${c.slug}`} />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Settings</h2>
          <form action={opsSaveCategory} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Name">
              <input name="name" className="input" defaultValue={c.name} />
            </Field>
            <Field label="Plural">
              <input name="plural_name" className="input" defaultValue={c.plural_name} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <input name="description" className="input" defaultValue={c.description} />
              </Field>
            </div>
            <Field label="Credits per unlock">
              <input name="unlock_credit_cost" className="input" defaultValue={c.unlock_credit_cost} />
            </Field>
            <Field label="Unlock cap per lead">
              <input name="unlock_cap" className="input" defaultValue={c.unlock_cap} />
            </Field>
            <Field label="Price unit">
              <input name="price_unit" className="input" defaultValue={c.price_unit} />
            </Field>
            <Field label="Wave">
              <input name="wave" className="input" defaultValue={c.wave} />
            </Field>
            <Field label="Sort order">
              <input name="sort" className="input" defaultValue={c.sort} />
            </Field>
            <label className="flex items-center gap-2 self-end py-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={c.active} /> Open to brides and vendors
            </label>
            <button className="btn btn-sm sm:col-span-2 sm:justify-self-start">Save</button>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Budget tiers</h2>
          <p className="hint">Leads get a tier from the bride's budget. Plans can be limited to tiers; top-ups unlock any tier.</p>
          <div className="mt-3 space-y-2">
            {[...tiers, null].map((t, i) => (
              <form key={t?.id ?? `new-${i}`} action={opsSaveTier} className="grid gap-2 sm:grid-cols-[90px_1fr_100px_100px_auto]">
                <input type="hidden" name="category_id" value={c.id} />
                <input name="code" className="input py-1" defaultValue={t?.code ?? ''} placeholder="code" aria-label="Code" readOnly={Boolean(t)} />
                <input name="label" className="input py-1" defaultValue={t?.label ?? ''} placeholder="Label" aria-label="Label" />
                <input name="min_inr" className="input py-1" defaultValue={t?.min_inr ?? ''} placeholder="min ₹" aria-label="Minimum ₹" />
                <input name="max_inr" className="input py-1" defaultValue={t?.max_inr ?? ''} placeholder="max ₹" aria-label="Maximum ₹" />
                <button className="btn btn-ghost btn-sm">{t ? 'Save' : 'Add'}</button>
              </form>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="font-semibold">Fields</h2>
        <p className="hint">
          Filterable fields become landing pages (a yes/no field needs an SEO slug; options need one in the third column). FAQ text uses
          {' {name} '}for the business name. Options: one per line, <code>value | label | seo-slug</code>.
        </p>
        <div className="mt-3 space-y-4">
          {[...fields, null].map((f, i) => (
            <form key={f?.id ?? `new-${i}`} action={opsSaveField} className="grid gap-2 rounded-lg border border-[var(--color-line)] p-3 sm:grid-cols-4">
              <input type="hidden" name="category_id" value={c.id} />
              <input name="key" required className="input py-1" defaultValue={f?.key ?? ''} placeholder="key" readOnly={Boolean(f)} aria-label="Key" />
              <input name="label" className="input py-1" defaultValue={f?.label ?? ''} placeholder="Label" aria-label="Label" />
              <select name="type" className="input py-1" defaultValue={f?.type ?? 'bool'} aria-label="Type">
                {['bool', 'select', 'multiselect', 'number', 'money', 'text'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input name="sort" className="input py-1" defaultValue={f?.sort ?? 0} aria-label="Sort" />
              <textarea
                name="options"
                rows={2}
                className="input py-1 sm:col-span-2"
                defaultValue={(f?.options ?? []).map((o) => [o.value, o.label, o.seo].filter(Boolean).join(' | ')).join('\n')}
                placeholder="value | label | seo-slug"
                aria-label="Options"
              />
              <input name="faq_question" className="input py-1" defaultValue={f?.faq_question ?? ''} placeholder="FAQ question" aria-label="FAQ question" />
              <input name="seo_slug" className="input py-1" defaultValue={f?.seo_slug ?? ''} placeholder="SEO slug (yes/no fields)" aria-label="SEO slug" />
              <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-4">
                {(['required', 'filterable', 'on_card'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" name={k} defaultChecked={Boolean(f?.[k])} /> {k.replace('_', ' ')}
                  </label>
                ))}
                <button className="btn btn-sm">{f ? 'Save' : 'Add field'}</button>
              </div>
            </form>
          ))}
        </div>
        {fields.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {fields.map((f) => (
              <form key={f.id} action={opsDeleteField}>
                <input type="hidden" name="category_id" value={c.id} />
                <input type="hidden" name="field_id" value={f.id} />
                <button className="btn btn-ghost btn-sm">Delete {f.key}</button>
              </form>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  );
}
