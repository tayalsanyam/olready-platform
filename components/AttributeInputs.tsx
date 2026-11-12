import type { CategoryField } from '@/lib/catalog';

/** Form inputs for one category's fields, named attr_<key>; read back with attrsFromForm. */
export function AttributeInputs({ fields, values = {} }: { fields: CategoryField[]; values?: Record<string, unknown> }) {
  const sections = [...new Set(fields.map((f) => f.section ?? ''))];
  if (sections.length <= 1) return <FieldGrid fields={fields} values={values} />;
  return (
    <div className="space-y-6">
      {sections.map((sec) => (
        <section key={sec}>
          <h3 className="mb-3 border-b border-[var(--color-line)] pb-1.5 font-semibold">{sec || 'More details'}</h3>
          <FieldGrid fields={fields.filter((f) => (f.section ?? '') === sec)} values={values} />
        </section>
      ))}
    </div>
  );
}

function FieldGrid({ fields, values }: { fields: CategoryField[]; values: Record<string, unknown> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.key];
        const name = `attr_${f.key}`;
        const label = `${f.label}${f.required ? ' *' : ''}`;
        switch (f.type) {
          case 'bool':
            return (
              <label key={f.key} className="flex items-center gap-2 self-end py-2">
                <input type="checkbox" name={name} defaultChecked={Boolean(v)} className="h-4 w-4 accent-[var(--color-pink)]" />
                <span className="text-sm font-semibold">{f.label}</span>
              </label>
            );
          case 'select':
            return (
              <label key={f.key} className="block">
                <span className="label">{label}</span>
                <select name={name} defaultValue={(v as string) ?? ''} className="input" required={f.required}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case 'multiselect':
            return (
              <fieldset key={f.key} className="sm:col-span-2">
                <legend className="label">{label}</legend>
                <input type="hidden" name={name} value="__multi" />
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                      <input
                        type="checkbox"
                        name={name}
                        value={o.value}
                        defaultChecked={Array.isArray(v) && v.includes(o.value)}
                        className="h-4 w-4 accent-[var(--color-pink)]"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          default:
            return (
              <label key={f.key} className="block">
                <span className="label">{label}</span>
                <input
                  name={name}
                  defaultValue={v == null ? '' : String(v)}
                  className="input"
                  inputMode={f.type === 'number' || f.type === 'money' ? 'numeric' : undefined}
                  required={f.required}
                />
              </label>
            );
        }
      })}
    </div>
  );
}
