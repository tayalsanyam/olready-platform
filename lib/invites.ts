import type { Db } from './db';
import { DomainError } from './db';
import { assertMember, events } from './weddings';
import { slugify } from './catalog';
import type { InviteContent, InviteDesign, InviteLayout, InviteTheme } from './inviteDesign';

export type DesignRow = InviteDesign & { id: number; uses: number };

export async function inviteDesigns(
  db: Db,
  f: { kind?: string | null; culture?: string | null; theme?: string | null; sort?: 'trending' | 'newest' } = {}
) {
  return db<DesignRow[]>`
    select t.id, t.code, t.name, t.layout, t.theme, t.kind, t.culture, t.themes,
           (select count(*) from mkt.invites i where i.template_id = t.id and i.published)::int as uses
    from mkt.invite_templates t
    where t.active
      and (${f.kind ?? null}::text is null or t.kind = ${f.kind ?? null})
      and (${f.culture ?? null}::text is null or t.culture = ${f.culture ?? null} or t.culture = 'generic')
      and (${f.theme ?? null}::text is null or ${f.theme ?? null} = any(t.themes))
    order by (t.culture = ${f.culture ?? ''}) desc, ${f.sort === 'newest' ? db`t.id desc` : db`uses desc, t.sort, t.id`}`;
}

export async function inviteDesign(db: Db, code: string) {
  const [d] = await db<DesignRow[]>`
    select t.id, t.code, t.name, t.layout, t.theme, t.kind, t.culture, t.themes,
           (select count(*) from mkt.invites i where i.template_id = t.id and i.published)::int as uses
    from mkt.invite_templates t where t.code = ${code} and t.active`;
  return d ?? null;
}

const fmtWhen = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d) : 'Time to be announced';
const fmtDate = (s: string | null) =>
  s ? new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${s}T12:00:00+05:30`)) : '';

export type SavedInvite = {
  id: string;
  slug: string;
  kind: 'card' | 'save_the_date';
  published: boolean;
  template_code: string;
  layout: InviteLayout;
  theme: InviteTheme;
  headline: string;
  opening_line: string;
  bride_name: string;
  groom_name: string;
  family_line: string;
  message: string;
  photo_url: string | null;
  wedding_date: string | null;
  wedding_id: string;
};

const cols = (db: Db) => db`
  i.id, i.slug, i.kind, i.published, t.code as template_code, t.layout, t.theme, i.headline, i.opening_line, i.bride_name,
  i.groom_name, i.family_line, i.message, i.photo_url, to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date, i.wedding_id`;

export async function weddingInvites(db: Db, weddingId: string) {
  return db<SavedInvite[]>`
    select ${cols(db)} from mkt.invites i join mkt.invite_templates t on t.id = i.template_id join mkt.weddings w on w.id = i.wedding_id
    where i.wedding_id = ${weddingId} order by i.kind`;
}

/** Turns a saved invite plus the wedding's functions into what the card shows. */
export async function contentFor(db: Db, inv: SavedInvite): Promise<InviteContent> {
  const evs = await events(db, inv.wedding_id);
  return {
    kind: inv.kind,
    opening: inv.opening_line,
    bride: inv.bride_name,
    groom: inv.groom_name,
    family: inv.family_line,
    dateLine: fmtDate(inv.wedding_date),
    message: inv.message,
    events: evs.map((e) => ({ name: e.name, when: fmtWhen(e.starts_at), venue: e.venue })),
    photo: inv.photo_url,
  };
}

export async function inviteBySlug(db: Db, slug: string) {
  const [i] = await db<SavedInvite[]>`
    select ${cols(db)} from mkt.invites i join mkt.invite_templates t on t.id = i.template_id join mkt.weddings w on w.id = i.wedding_id
    where i.slug = ${slug} and i.published`;
  if (!i) return null;
  return { invite: i, content: await contentFor(db, i) };
}

export type InviteInput = {
  kind: 'card' | 'save_the_date';
  templateCode: string;
  opening: string;
  bride: string;
  groom: string;
  family: string;
  message: string;
  photoUrl?: string | null;
  publish: boolean;
};

export async function saveWeddingInvite(db: Db, weddingId: string, profileId: string, input: InviteInput) {
  await assertMember(db, weddingId, profileId);
  const kind = input.kind === 'save_the_date' ? 'save_the_date' : 'card';
  const design = await inviteDesign(db, input.templateCode);
  if (!design) throw new DomainError('bad_design', 'Pick a design');
  if (!input.bride.trim() || !input.groom.trim()) throw new DomainError('names', 'Add both names');
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  const headline = `${clip(input.bride, 40)} & ${clip(input.groom, 40)}`;
  const [existing] = await db<{ id: string; slug: string }[]>`select id, slug from mkt.invites where wedding_id = ${weddingId} and kind = ${kind}`;
  if (existing) {
    await db`
      update mkt.invites set template_id = ${design.id}, headline = ${headline}, opening_line = ${clip(input.opening, 120)},
        bride_name = ${clip(input.bride, 40)}, groom_name = ${clip(input.groom, 40)}, family_line = ${clip(input.family, 160)},
        message = ${clip(input.message, 400)}, photo_url = coalesce(${input.photoUrl ?? null}, photo_url),
        published = ${input.publish}, updated_at = now()
      where id = ${existing.id}`;
    return existing.slug;
  }
  const slug = `${slugify(`${input.bride}-${input.groom}`).slice(0, 40)}-${kind === 'save_the_date' ? 'std-' : ''}${weddingId.slice(0, 6)}`;
  await db`
    insert into mkt.invites (wedding_id, template_id, kind, slug, headline, opening_line, bride_name, groom_name, family_line, message, photo_url, published)
    values (${weddingId}, ${design.id}, ${kind}, ${slug}, ${headline}, ${clip(input.opening, 120)}, ${clip(input.bride, 40)},
      ${clip(input.groom, 40)}, ${clip(input.family, 160)}, ${clip(input.message, 400)}, ${input.photoUrl ?? null}, ${input.publish})`;
  return slug;
}

export async function removeInvitePhoto(db: Db, weddingId: string, profileId: string, kind: string) {
  await assertMember(db, weddingId, profileId);
  await db`update mkt.invites set photo_url = null where wedding_id = ${weddingId} and kind = ${kind}`;
}
