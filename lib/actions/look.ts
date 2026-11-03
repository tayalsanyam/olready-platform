'use server';

import { DomainError, sql } from '../db';
import { visitorKey } from '../analytics';
import { ideaTopic, topicTags } from '../ideas';
import { readLook, takeLookAllowance } from '../look';
import { sniffImage } from '../storage';
import { requireVendor } from '../vendorSession';
import { attempt, str } from './run';

/** Reads the photo into styles and shows matching vendors. The photo is never stored. */
export async function lookPhotoAction(fd: FormData) {
  const topic = str(fd, 'topic');
  const city = str(fd, 'city');
  await attempt(`/look?topic=${encodeURIComponent(topic)}${city ? `&city=${encodeURIComponent(city)}` : ''}`, async () => {
    const t = await ideaTopic(sql, topic);
    if (!t || !t.category_id) throw new DomainError('topic', 'Pick what you are looking for');
    const f = fd.get('photo');
    if (!(f instanceof File) || !f.size) throw new DomainError('photo', 'Choose a photo');
    if (f.size > 4 * 1024 * 1024) throw new DomainError('photo', 'Photos must be under 4 MB');
    const buf = new Uint8Array(await f.arrayBuffer());
    const kind = sniffImage(buf);
    if (!kind) throw new DomainError('photo', 'Use a JPEG, PNG or WebP photo');
    const visitor = (await visitorKey()) ?? 'anon';
    await takeLookAllowance(sql, visitor);
    const tags = await readLook(buf, kind.mime, t.name, await topicTags(sql, t.id));
    if (!tags.length) throw new DomainError('none', 'We could not match that photo to a style. Pick the styles that fit instead.');
    return `/look?topic=${t.slug}${city ? `&city=${encodeURIComponent(city)}` : ''}&tags=${tags.join(',')}&from=photo`;
  });
}

export async function vendorKnownForAction(fd: FormData) {
  await attempt('/vendor/profile', async () => {
    const { vendor } = await requireVendor('/vendor/profile');
    const [t] = await sql<{ id: number }[]>`select id from mkt.idea_topics where category_id = ${vendor.category_id}`;
    const allowed = t ? (await topicTags(sql, t.id)).map((x) => x.slug) : [];
    const picked = [...new Set(fd.getAll('known_for').map(String))].filter((x) => allowed.includes(x));
    if (picked.length > 6) throw new DomainError('too_many', 'Pick up to 6 styles');
    await sql`update mkt.vendors set known_for = ${picked}, updated_at = now() where id = ${vendor.id}`;
    return { ok: 'Saved what you are known for' };
  });
}
