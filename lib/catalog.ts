import type { Db } from './db';
import { DomainError } from './db';

/** For number fields, min/max turn an option into a range filter ("500+ guests"). */
export type FieldOption = { value: string; label: string; seo?: string; min?: number; max?: number };
export type CategoryField = {
  id: number;
  category_id: number;
  key: string;
  label: string;
  type: 'number' | 'money' | 'text' | 'bool' | 'select' | 'multiselect';
  options: FieldOption[];
  required: boolean;
  filterable: boolean;
  on_card: boolean;
  faq_question: string | null;
  seo_slug: string | null;
  sort: number;
};
export type PriceBand = { seo: string; label: string; min?: number; max?: number };
export type Category = {
  id: number;
  slug: string;
  name: string;
  plural_name: string;
  description: string;
  wave: number;
  sort: number;
  active: boolean;
  unlock_credit_cost: number;
  unlock_cap: number;
  price_unit: string;
  price_bands?: PriceBand[];
};
export type City = {
  id: number; slug: string; name: string; state: string; state_code: string; district: string; active: boolean; launched: boolean;
  aliases: string[]; lat: string | null; lng: string | null; // numeric comes back as text
};
export type BudgetTier = {
  id: number;
  category_id: number;
  code: string;
  label: string;
  min_inr: number | null;
  max_inr: number | null;
};

export async function listCategories(db: Db, opts: { activeOnly?: boolean } = {}) {
  return opts.activeOnly
    ? db<Category[]>`select * from mkt.categories where active order by sort`
    : db<Category[]>`select * from mkt.categories order by sort`;
}

export async function getCategoryBySlug(db: Db, slug: string) {
  const [c] = await db<Category[]>`select * from mkt.categories where slug = ${slug}`;
  return c ?? null;
}

/** The launched towns: menus, the home page, footers and quick picks. Any active town works everywhere else. */
export async function listCities(db: Db) {
  return db<City[]>`select * from mkt.cities where active and launched order by sort`;
}

export async function getCity(db: Db, id: number | null | undefined) {
  if (!id) return null;
  const [c] = await db<City[]>`select * from mkt.cities where id = ${id} and active`;
  return c ?? null;
}

export async function citiesByIds(db: Db, ids: number[]) {
  if (!ids.length) return [] as City[];
  return db<City[]>`select * from mkt.cities where id = any(${ids}::int[]) order by launched desc, sort`;
}

/** Towns that have something in them (live vendors or requests), for Ops filters. */
export async function citiesInUse(db: Db) {
  return db<City[]>`
    select * from mkt.cities c where c.active and (c.launched
      or exists (select 1 from mkt.vendors v where v.city_id = c.id)
      or exists (select 1 from mkt.leads l where l.city_id = c.id))
    order by c.launched desc, c.sort, c.name`;
}

export async function getCityBySlug(db: Db, slug: string) {
  const [c] = await db<City[]>`select * from mkt.cities where slug = ${slug} and active`;
  return c ?? null;
}

export async function fieldsFor(db: Db, categoryId: number) {
  return db<CategoryField[]>`
    select * from mkt.category_fields where category_id = ${categoryId} order by sort, id`;
}

export async function tiersFor(db: Db, categoryId: number) {
  return db<BudgetTier[]>`
    select * from mkt.budget_tiers where category_id = ${categoryId} order by sort, id`;
}

/** Picks the tier whose range holds the budget. */
export function tierForBudget(tiers: BudgetTier[], budget: number | null | undefined) {
  if (budget == null) return null;
  return (
    tiers.find((t) => (t.min_inr ?? 0) <= budget && (t.max_inr == null || budget < t.max_inr)) ?? null
  );
}

/**
 * Validates raw form values against a category's fields and returns clean attributes.
 * Unknown keys are dropped; required fields must be present.
 */
export function validateAttributes(fields: CategoryField[], raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const v = raw[f.key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.type === 'bool') {
        out[f.key] = false;
        continue;
      }
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    switch (f.type) {
      case 'number':
      case 'money': {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) errors.push(`${f.label} must be a positive number`);
        else out[f.key] = Math.round(n);
        break;
      }
      case 'bool':
        out[f.key] = v === true || v === 'true' || v === 'on' || v === '1';
        break;
      case 'text':
        out[f.key] = String(v).slice(0, 500).trim();
        break;
      case 'select': {
        const s = String(v);
        if (!f.options.some((o) => o.value === s)) errors.push(`${f.label} has an invalid choice`);
        else out[f.key] = s;
        break;
      }
      case 'multiselect': {
        const arr = (Array.isArray(v) ? v : [v]).map(String);
        const bad = arr.filter((s) => !f.options.some((o) => o.value === s));
        if (bad.length) errors.push(`${f.label} has an invalid choice`);
        else out[f.key] = Array.from(new Set(arr));
        break;
      }
    }
  }
  if (errors.length) throw new DomainError('invalid_attributes', errors.join('; '));
  return out;
}

/** Human-readable value of one attribute, for cards and FAQs. */
export function displayValue(f: CategoryField, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  switch (f.type) {
    case 'bool':
      return v ? 'Yes' : 'No';
    case 'select':
      return f.options.find((o) => o.value === v)?.label ?? String(v);
    case 'multiselect':
      return (v as string[]).map((x) => f.options.find((o) => o.value === x)?.label ?? x).join(', ');
    case 'money':
      return formatInr(Number(v));
    default:
      return String(v);
  }
}

export function formatInr(n: number | null | undefined) {
  if (n == null) return '';
  return '₹' + new Intl.NumberFormat('en-IN').format(n);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
