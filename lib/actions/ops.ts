'use server';

import { sql, DomainError, audit } from '../db';
import { requireRole, type Role } from '../auth';
import {
  addNeed,
  advanceVerification,
  createEnquiry,
  grantCredits,
  markLeadFake,
  rejectLead,
  removeNeed,
  reopenNeed,
  setNeedBudget,
} from '../leads';
import { createVendor, decideClaim, inviteClaim, setVendorStatus } from '../vendors';
import { activateSubscription, markOrderPaid, setGateway, type Gateway } from '../payments';
import { decideDispute, markContacted } from '../reviews';
import { moderateRealWedding, tagVendor } from '../realWeddings';
import { queueEmail } from '../email';
import { notifyNewLead, notifyRmAssigned } from '../notify';
import { slugify } from '../catalog';
import { STATE_CODES } from '../gst';
import { addRmNote, approveEngagement, reassign, rejectEngagement } from '../rm';
import { attempt, attrsFromForm, back, num, str } from './run';

const OPS: Role[] = ['ops', 'admin'];
const CONTENT: Role[] = ['content', 'ops', 'admin'];
const ADMIN: Role[] = ['admin'];

// ---------------------------------------------------------------- leads
export async function opsCreateLead(fd: FormData) {
  await attempt('/ops/leads', async () => {
    await requireRole(OPS);
    const lead = await createEnquiry(sql, {
      name: str(fd, 'name'),
      phone: str(fd, 'phone'),
      email: str(fd, 'email') || null,
      cityId: num(fd, 'city_id') ?? 0,
      eventDate: str(fd, 'event_date') || null,
      source: (str(fd, 'source') || 'ops') as 'ops',
      needs: fd.getAll('category_id').map((c) => ({ categoryId: Number(c) })),
    });
    return `/ops/leads/${lead.id}`;
  });
}

export async function opsAdvance(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    const stage = Number(str(fd, 'stage')) as 1 | 2 | 3;
    await advanceVerification(sql, leadId, stage, p.id, str(fd, 'notes'));
    if (stage === 3) {
      const [l] = await sql<{ email: string | null; bride_name: string }[]>`select email, bride_name from mkt.leads where id = ${leadId}`;
      if (l?.email) await queueEmail(sql, l.email, 'lead_verified', { name: l.bride_name.split(' ')[0] }, `verified:${leadId}`);
      await notifyNewLead(sql, leadId);
    }
    return { ok: stage === 3 ? 'Verified. Vendors can now see this lead.' : `Stage ${stage} recorded` };
  });
}

export async function opsAddNeed(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    await addNeed(sql, leadId, num(fd, 'category_id') ?? 0, num(fd, 'budget_inr'), { actor: p.id });
    return { ok: 'Category added' };
  });
}

export async function opsSetBudget(fd: FormData) {
  await attempt(back(fd, '/ops/leads'), async () => {
    const p = await requireRole(OPS);
    await setNeedBudget(sql, str(fd, 'need_id'), num(fd, 'budget_inr'), p.id);
    return { ok: 'Budget saved' };
  });
}

export async function opsSetGuests(fd: FormData) {
  await attempt(back(fd, '/ops/leads'), async () => {
    const p = await requireRole(OPS);
    const n = num(fd, 'guest_count');
    if (n != null && (n < 1 || n > 20000)) throw new DomainError('bad_guests', 'Guests must be between 1 and 20,000');
    const id = str(fd, 'lead_id');
    await sql`update mkt.leads set guest_count = ${n} where id = ${id}`;
    await audit(sql, p.id, 'lead.guests', 'lead', id, { guest_count: n });
    return { ok: 'Guest count saved' };
  });
}

export async function opsRemoveNeed(fd: FormData) {
  await attempt(back(fd, '/ops/leads'), async () => {
    const p = await requireRole(OPS);
    await removeNeed(sql, str(fd, 'need_id'), p.id);
    return { ok: 'Category removed' };
  });
}

export async function opsRejectLead(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    await rejectLead(sql, leadId, p.id, str(fd, 'reason') || 'not reachable');
    return { ok: 'Lead closed' };
  });
}

export async function opsMarkFake(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    const reason = str(fd, 'reason');
    if (!reason) throw new DomainError('no_reason', 'Write why this lead is fake or wrong');
    const r = await markLeadFake(sql, leadId, fd.getAll('refund').map(String), p.id, reason);
    return { ok: `Lead removed. ${r.refunded} vendor${r.refunded === 1 ? '' : 's'} refunded.` };
  });
}

export async function opsReopen(fd: FormData) {
  await attempt(back(fd, '/ops/needs'), async () => {
    const p = await requireRole(OPS);
    await reopenNeed(sql, str(fd, 'need_id'), p.id);
    const [n] = await sql<{ lead_id: string }[]>`select lead_id from mkt.lead_needs where id = ${str(fd, 'need_id')}`;
    if (n) await notifyNewLead(sql, n.lead_id);
    return { ok: 'Reopened for more vendors' };
  });
}

// ---------------------------------------------------------------- vendors
export async function opsVendorStatus(fd: FormData) {
  const vendorId = str(fd, 'vendor_id');
  await attempt(`/ops/vendors/${vendorId}`, async () => {
    const p = await requireRole(OPS);
    const cities = fd.getAll('service_city_id').map(Number).filter(Boolean);
    await setVendorStatus(
      sql,
      vendorId,
      {
        status: (str(fd, 'status') || undefined) as never,
        verified: fd.get('verified') === 'on',
        assured: fd.get('assured') === 'on',
        serviceCityIds: cities.length ? cities : undefined,
      },
      p.id
    );
    return { ok: 'Vendor updated' };
  });
}

export async function opsCreateVendor(fd: FormData) {
  await attempt('/ops/vendors', async () => {
    const p = await requireRole(OPS);
    const v = await createVendor(
      sql,
      {
        business_name: str(fd, 'business_name'),
        category_id: num(fd, 'category_id') ?? 0,
        city_id: num(fd, 'city_id') ?? 0,
        starting_price_inr: num(fd, 'starting_price_inr'),
        phone: str(fd, 'phone') || null,
        email: str(fd, 'email') || null,
        instagram: str(fd, 'instagram') || null,
        attributes: attrsFromForm(fd),
      },
      { ownerProfileId: null, actor: p.id }
    );
    return { to: `/ops/vendors/${v.id}`, ok: 'Draft profile created. Invite the owner to claim it.' };
  });
}

export async function opsInviteClaim(fd: FormData) {
  const vendorId = str(fd, 'vendor_id');
  await attempt(`/ops/vendors/${vendorId}`, async () => {
    const p = await requireRole(OPS);
    const email = str(fd, 'email').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError('bad_email', 'Enter the owner email');
    const c = await inviteClaim(sql, vendorId, email, p.id);
    const [v] = await sql<{ business_name: string }[]>`select business_name from mkt.vendors where id = ${vendorId}`;
    await queueEmail(sql, email, 'claim_invite', { business: v.business_name, token: c.token }, `claim:${c.id}`);
    return { ok: `Invite queued to ${email}` };
  });
}

export async function opsDecideClaim(fd: FormData) {
  await attempt('/ops/vendors', async () => {
    const p = await requireRole(OPS);
    await decideClaim(sql, str(fd, 'claim_id'), str(fd, 'approve') === '1', p.id);
    return { ok: 'Claim decided' };
  });
}

export async function opsAdjustCredits(fd: FormData) {
  const vendorId = str(fd, 'vendor_id');
  await attempt(`/ops/vendors/${vendorId}`, async () => {
    const p = await requireRole(ADMIN);
    const n = num(fd, 'credits');
    const note = str(fd, 'note');
    if (!n) throw new DomainError('zero', 'Enter a non-zero number of credits');
    if (!note) throw new DomainError('no_note', 'Write why you are adjusting credits');
    await grantCredits(sql, vendorId, str(fd, 'kind') === 'plan' ? 'plan' : 'topup', Math.round(n), 'adjustment', null, p.id, note);
    await audit(sql, p.id, 'credits.adjust', 'vendor', vendorId, { n, note });
    return { ok: 'Credits adjusted' };
  });
}

// ---------------------------------------------------------------- catalog
export async function opsSaveCategory(fd: FormData) {
  const id = num(fd, 'id');
  await attempt(id ? `/ops/catalog/${id}` : '/ops/catalog', async () => {
    const p = await requireRole(ADMIN);
    const name = str(fd, 'name');
    const plural = str(fd, 'plural_name') || name + 's';
    const cost = num(fd, 'unlock_credit_cost') ?? 1;
    const cap = num(fd, 'unlock_cap') ?? 10;
    if (!name) throw new DomainError('empty', 'Name the category');
    if (cost < 1 || cap < 1) throw new DomainError('bad_numbers', 'Credit cost and cap must be at least 1');
    if (id) {
      await sql`
        update mkt.categories set name = ${name}, plural_name = ${plural}, description = ${str(fd, 'description')},
          wave = ${num(fd, 'wave') ?? 1}, sort = ${num(fd, 'sort') ?? 0}, active = ${fd.get('active') === 'on'},
          unlock_credit_cost = ${cost}, unlock_cap = ${cap}, price_unit = ${str(fd, 'price_unit') || 'per function'}
        where id = ${id}`;
      await audit(sql, p.id, 'category.update', 'category', String(id));
      return { ok: 'Saved. New caps apply to new leads; existing leads keep their cap.' };
    }
    const [c] = await sql<{ id: number }[]>`
      insert into mkt.categories (slug, name, plural_name, unlock_credit_cost, unlock_cap)
      values (${slugify(plural)}, ${name}, ${plural}, ${cost}, ${cap}) returning id`;
    await audit(sql, p.id, 'category.create', 'category', String(c.id));
    return `/ops/catalog/${c.id}`;
  });
}

// ---------------------------------------------------------------- cities and towns
export async function opsSaveCity(fd: FormData) {
  await attempt('/ops/catalog#cities', async () => {
    const p = await requireRole(ADMIN);
    const id = num(fd, 'id');
    const name = str(fd, 'name').slice(0, 60);
    const state = str(fd, 'state');
    if (!name) throw new DomainError('empty', 'Name the town');
    if (!Object.values(STATE_CODES).includes(state)) throw new DomainError('state', 'Pick the state, so tax invoices show the right place of supply');
    if (id) {
      await sql`update mkt.cities set name = ${name}, state = ${state}, sort = ${num(fd, 'sort') ?? 0}, active = ${fd.get('active') === 'on'} where id = ${id}`;
      await audit(sql, p.id, 'city.update', 'city', String(id));
      return { ok: `${name} saved` };
    }
    const slug = slugify(name);
    const [dup] = await sql`select 1 from mkt.cities where slug = ${slug}`;
    if (dup) throw new DomainError('dup', `${name} is already listed`);
    const [{ sort }] = await sql<{ sort: number }[]>`select coalesce(max(sort), 0) + 1 as sort from mkt.cities`;
    const [c] = await sql<{ id: number }[]>`insert into mkt.cities (slug, name, state, sort) values (${slug}, ${name}, ${state}, ${sort}) returning id`;
    await audit(sql, p.id, 'city.create', 'city', String(c.id), { name, state });
    return { ok: `${name} added. Its city and category pages appear once vendors there go live.` };
  });
}

/** Options are typed one per line: value | label | seo-slug (seo optional). */
function parseOptions(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [value, label, seo] = l.split('|').map((x) => x.trim());
      if (!/^[a-z0-9_]+$/.test(value ?? '')) throw new DomainError('bad_option', `Option value "${value}" must be lowercase letters, digits or _`);
      return { value, label: label || value, ...(seo ? { seo: slugify(seo) } : {}) };
    });
}

export async function opsSaveField(fd: FormData) {
  const categoryId = num(fd, 'category_id') ?? 0;
  await attempt(`/ops/catalog/${categoryId}`, async () => {
    const p = await requireRole(ADMIN);
    const key = str(fd, 'key');
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new DomainError('bad_key', 'Key must be lowercase letters, digits or _');
    const type = str(fd, 'type');
    if (!['number', 'money', 'text', 'bool', 'select', 'multiselect'].includes(type)) throw new DomainError('bad_type', 'Pick a field type');
    const options = ['select', 'multiselect'].includes(type) ? parseOptions(str(fd, 'options')) : [];
    if (['select', 'multiselect'].includes(type) && !options.length) throw new DomainError('no_options', 'Add at least one option');
    const flag = (k: string) => fd.get(k) === 'on';
    await sql`
      insert into mkt.category_fields (category_id, key, label, type, options, required, filterable, on_card, faq_question, seo_slug, sort)
      values (${categoryId}, ${key}, ${str(fd, 'label') || key}, ${type}, ${sql.json(options)}, ${flag('required')}, ${flag('filterable')},
        ${flag('on_card')}, ${str(fd, 'faq_question') || null}, ${str(fd, 'seo_slug') ? slugify(str(fd, 'seo_slug')) : null}, ${num(fd, 'sort') ?? 0})
      on conflict (category_id, key) do update set label = excluded.label, type = excluded.type, options = excluded.options,
        required = excluded.required, filterable = excluded.filterable, on_card = excluded.on_card,
        faq_question = excluded.faq_question, seo_slug = excluded.seo_slug, sort = excluded.sort`;
    await audit(sql, p.id, 'field.save', 'category', String(categoryId), { key });
    return { ok: `Field ${key} saved` };
  });
}

export async function opsDeleteField(fd: FormData) {
  const categoryId = num(fd, 'category_id') ?? 0;
  await attempt(`/ops/catalog/${categoryId}`, async () => {
    const p = await requireRole(ADMIN);
    await sql`delete from mkt.category_fields where id = ${num(fd, 'field_id')} and category_id = ${categoryId}`;
    await audit(sql, p.id, 'field.delete', 'category', String(categoryId));
    return { ok: 'Field removed. Existing vendor values are kept but no longer shown.' };
  });
}

export async function opsSaveTier(fd: FormData) {
  const categoryId = num(fd, 'category_id') ?? 0;
  await attempt(`/ops/catalog/${categoryId}`, async () => {
    const p = await requireRole(ADMIN);
    const code = slugify(str(fd, 'code')).replace(/-/g, '_');
    if (!code) throw new DomainError('bad_code', 'Give the tier a code');
    await sql`
      insert into mkt.budget_tiers (category_id, code, label, min_inr, max_inr, sort)
      values (${categoryId}, ${code}, ${str(fd, 'label') || code}, ${num(fd, 'min_inr')}, ${num(fd, 'max_inr')}, ${num(fd, 'sort') ?? 0})
      on conflict (category_id, code) do update set label = excluded.label, min_inr = excluded.min_inr, max_inr = excluded.max_inr, sort = excluded.sort`;
    await audit(sql, p.id, 'tier.save', 'category', String(categoryId), { code });
    return { ok: 'Tier saved' };
  });
}

// ---------------------------------------------------------------- payments
export async function opsToggleGateway(fd: FormData) {
  await attempt('/ops/payments', async () => {
    const p = await requireRole(ADMIN);
    await setGateway(sql, str(fd, 'gateway') as Gateway, str(fd, 'enabled') === '1', p.id);
    return { ok: 'Payment setting saved' };
  });
}

export async function opsMarkPaid(fd: FormData) {
  await attempt('/ops/payments', async () => {
    const p = await requireRole(OPS);
    const ref = str(fd, 'reference');
    if (!ref) throw new DomainError('no_ref', 'Enter the bank reference');
    const [o] = await sql<{ gateway: string }[]>`select gateway from mkt.orders where id = ${str(fd, 'order_id')}`;
    if (o?.gateway !== 'manual') throw new DomainError('not_manual', 'Only bank-transfer orders are marked paid by hand');
    await markOrderPaid(sql, str(fd, 'order_id'), ref, p.id);
    return { ok: 'Marked paid' };
  });
}

export async function opsActivateSub(fd: FormData) {
  await attempt('/ops/payments', async () => {
    const p = await requireRole(OPS);
    await activateSubscription(sql, str(fd, 'sub_id'), str(fd, 'invoice_url'), str(fd, 'contract_url'), p.id);
    return { ok: 'Plan activated and credits granted' };
  });
}

export async function opsSavePack(fd: FormData) {
  await attempt('/ops/payments', async () => {
    const p = await requireRole(ADMIN);
    const price = num(fd, 'price_inr');
    const credits = num(fd, 'credits');
    if (price == null || !credits) throw new DomainError('bad_pack', 'Enter credits and price');
    // Changes apply forward only: existing subscriptions keep what they bought.
    await sql`
      update mkt.packs set name = ${str(fd, 'name')}, price_inr = ${price}, credits = ${credits},
        validity_days = ${num(fd, 'validity_days')}, active = ${fd.get('active') === 'on'}, description = ${str(fd, 'description')}
      where id = ${num(fd, 'pack_id')}`;
    await audit(sql, p.id, 'pack.update', 'pack', str(fd, 'pack_id'), { price, credits });
    return { ok: 'Pack saved' };
  });
}

// ---------------------------------------------------------------- reviews
export async function opsContacted(fd: FormData) {
  await attempt('/ops/reviews', async () => {
    const p = await requireRole(OPS);
    await markContacted(sql, str(fd, 'dispute_id'), p.id);
    return { ok: 'Contact recorded. The vendor now has 7 days to send proof.' };
  });
}

export async function opsDecideDispute(fd: FormData) {
  await attempt('/ops/reviews', async () => {
    const p = await requireRole(OPS);
    await decideDispute(sql, str(fd, 'dispute_id'), str(fd, 'uphold') === '1', str(fd, 'note'), p.id);
    return { ok: 'Decision recorded' };
  });
}

// ---------------------------------------------------------------- content
export async function opsModerateWedding(fd: FormData) {
  await attempt('/ops/content', async () => {
    const p = await requireRole(CONTENT);
    await moderateRealWedding(sql, str(fd, 'id'), str(fd, 'publish') === '1', str(fd, 'note'), p.id);
    return { ok: 'Done' };
  });
}

export async function opsTagVendor(fd: FormData) {
  await attempt('/ops/content', async () => {
    const p = await requireRole(CONTENT);
    const slug = str(fd, 'vendor_slug').replace(/^.*\/v\//, '');
    const [v] = await sql<{ id: string }[]>`select id from mkt.vendors where slug = ${slug}`;
    if (!v) throw new DomainError('not_found', 'No vendor with that link');
    await tagVendor(sql, str(fd, 'id'), v.id, p.id);
    return { ok: 'Vendor tagged' };
  });
}

// ---------------------------------------------------------------- settings
export async function opsSaveSetting(fd: FormData) {
  await attempt('/ops/settings', async () => {
    const p = await requireRole(ADMIN);
    const key = str(fd, 'key');
    const value = num(fd, 'value');
    if (value == null || value < 0) throw new DomainError('bad_value', 'Enter a number');
    const [row] = await sql`update mkt.settings set value = ${sql.json(value)}, updated_at = now() where key = ${key} returning key`;
    if (!row) throw new DomainError('not_found', 'Unknown setting');
    await audit(sql, p.id, 'setting.update', 'setting', key, { value });
    return { ok: 'Saved' };
  });
}

// ---------------------------------------------------------------- relationship managers
export async function opsApproveRm(fd: FormData) {
  await attempt('/ops/rm', async () => {
    const p = await requireRole(OPS);
    await approveEngagement(sql, str(fd, 'id'), str(fd, 'rm_profile_id'), p.id);
    await notifyRmAssigned(sql, str(fd, 'id'));
    return { ok: 'Relationship manager assigned' };
  });
}

export async function opsRejectRm(fd: FormData) {
  await attempt('/ops/rm', async () => {
    const p = await requireRole(OPS);
    await rejectEngagement(sql, str(fd, 'id'), str(fd, 'note'), p.id);
    return { ok: 'Request declined. Arrange the refund if the bride paid.' };
  });
}

export async function opsReassignRm(fd: FormData) {
  await attempt('/ops/rm', async () => {
    const p = await requireRole(OPS);
    await reassign(sql, str(fd, 'id'), str(fd, 'rm_profile_id'), p.id);
    return { ok: 'Reassigned' };
  });
}

export async function rmAddNote(fd: FormData) {
  const id = str(fd, 'id');
  await attempt(`/ops/rm/${id}`, async () => {
    const p = await requireRole(['rm', 'ops', 'admin']);
    await addRmNote(sql, id, p, str(fd, 'body'));
    return { ok: 'Note saved' };
  });
}

export async function opsClearSuppression(fd: FormData) {
  await attempt('/ops/emails', async () => {
    const p = await requireRole(OPS);
    const email = str(fd, 'email').toLowerCase();
    await sql`delete from mkt.email_suppressions where email = ${email}`;
    await audit(sql, p.id, 'email.allow_again', 'email', email);
    return { ok: `${email} can receive email again` };
  });
}

export async function opsCloseContact(fd: FormData) {
  await attempt('/ops', async () => {
    const p = await requireRole(OPS);
    const { closeContact } = await import('../contact');
    await closeContact(sql, str(fd, 'id'), str(fd, 'note'), p.id);
    return { ok: 'Marked done' };
  });
}

// ---------------------------------------------------------------- functions on a request
export async function opsSaveFunctionAction(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    const { opsSaveFunction } = await import('../functions');
    const guests = Number(str(fd, 'guests').replace(/[^\d]/g, '')) || null;
    await opsSaveFunction(sql, leadId, { id: str(fd, 'event_id') || null, name: str(fd, 'name'), date: str(fd, 'date') || null, guests, needIds: fd.getAll('need_id').map(String) }, p.id);
    return { ok: 'Function saved' };
  });
}

export async function opsRemoveFunctionAction(fd: FormData) {
  const leadId = str(fd, 'lead_id');
  await attempt(`/ops/leads/${leadId}`, async () => {
    const p = await requireRole(OPS);
    const { opsRemoveFunction } = await import('../functions');
    await opsRemoveFunction(sql, leadId, str(fd, 'event_id'), p.id);
    return { ok: 'Function removed' };
  });
}
