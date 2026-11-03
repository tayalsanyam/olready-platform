'use server';

import { DomainError, sql } from '../db';
import { currentProfile, requireRole } from '../auth';
import { weddingFor } from '../weddings';
import { setIdeaHidden, setMediaTags, toggleSaved } from '../ideas';
import { requireVendor } from '../vendorSession';
import { attempt, back, str } from './run';

/** Saves a gallery photo or an article to the family's wedding wall (or removes it). */
export async function saveItemAction(fd: FormData) {
  const kind = str(fd, 'kind') === 'article' ? 'article' : 'photo';
  const ref = str(fd, 'ref');
  const returnTo = back(fd, '/ideas');
  await attempt(returnTo, async () => {
    const profile = await currentProfile();
    if (!profile) return `/login?next=${encodeURIComponent(returnTo)}`;
    if (profile.role !== 'bride') throw new DomainError('not_bride', 'Saving ideas is for brides and their families');
    const wedding = await weddingFor(sql, profile.id);
    if (!wedding) return { to: '/me', ok: 'Set up your wedding first, then save ideas' };
    if (!ref || ref.length > 80) throw new DomainError('bad_ref', 'Nothing to save');
    const saved = await toggleSaved(sql, wedding.id, kind, ref, profile.id);
    return { ok: saved ? 'Saved to your wedding wall' : 'Removed from your wedding wall' };
  });
}

export async function vendorTagPhoto(fd: FormData) {
  await attempt(back(fd, '/vendor/profile'), async () => {
    const { vendor } = await requireVendor();
    const tags = fd.getAll('tags').map(String);
    await setMediaTags(sql, str(fd, 'media_id'), vendor.id, tags, str(fd, 'caption'));
    return { ok: 'Photo details saved' };
  });
}

export async function opsHideIdea(fd: FormData) {
  const ref = str(fd, 'ref');
  await attempt(back(fd, `/ideas/photo/${ref}`), async () => {
    const p = await requireRole(['content', 'ops', 'admin']);
    const hide = str(fd, 'hide') === '1';
    await setIdeaHidden(sql, ref, hide, p.id);
    return { ok: hide ? 'Hidden from the gallery' : 'Back in the gallery' };
  });
}
