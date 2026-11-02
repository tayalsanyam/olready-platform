'use server';

import { sql, DomainError } from '../db';
import { requireProfile } from '../auth';
import { submitRealWedding } from '../realWeddings';
import { attempt, back, num, str } from './run';

export async function submitRealWeddingAction(fd: FormData) {
  await attempt(back(fd, '/'), async () => {
    const p = await requireProfile();
    if (!['bride', 'vendor'].includes(p.role)) throw new DomainError('forbidden', 'Only couples and vendors submit real weddings');
    await submitRealWedding(sql, p.id, {
      title: str(fd, 'title'),
      coupleNames: str(fd, 'couple_names'),
      cityId: num(fd, 'city_id'),
      weddingDate: str(fd, 'wedding_date') || null,
      story: str(fd, 'story'),
      coverImageUrl: str(fd, 'cover_image_url') || null,
      photoUrls: str(fd, 'photo_urls').split(/\s+/).filter(Boolean),
      vendorSlugs: str(fd, 'vendor_slugs')
        .split(/[\s,]+/)
        .map((s) => s.replace(/^.*\/v\//, '').replace(/\/$/, ''))
        .filter(Boolean),
      consent: fd.get('consent') === 'on',
    });
    return { ok: 'Thanks! Our team reviews every story before it is published.' };
  });
}
