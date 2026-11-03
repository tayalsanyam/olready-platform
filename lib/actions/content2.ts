'use server';

import { sql } from '../db';
import { requireRole } from '../auth';
import { saveArticle, setArticleStatus, subscribeNewsletter } from '../articles';
import { storeImage } from '../storage';
import { attempt, back, num, str } from './run';

const CONTENT = ['content', 'ops', 'admin'] as const;

export async function opsSaveArticle(fd: FormData) {
  const id = str(fd, 'id') || null;
  await attempt(id ? `/ops/articles/${id}` : '/ops/articles/new', async () => {
    const p = await requireRole([...CONTENT]);
    const f = fd.get('cover');
    const coverUrl = f instanceof File && f.size > 0 ? await storeImage(f, 'articles') : null;
    const saved = await saveArticle(
      sql,
      id,
      {
        title: str(fd, 'title'),
        slug: str(fd, 'slug'),
        excerpt: str(fd, 'excerpt'),
        body: String(fd.get('body') ?? ''),
        section: str(fd, 'section'),
        categoryId: num(fd, 'category_id'),
        cityId: num(fd, 'city_id'),
        coverUrl,
        authorName: str(fd, 'author_name'),
      },
      p.id
    );
    return { to: `/ops/articles/${saved}`, ok: 'Saved' };
  });
}

export async function opsArticleStatus(fd: FormData) {
  const id = str(fd, 'id');
  await attempt(`/ops/articles/${id}`, async () => {
    const p = await requireRole([...CONTENT]);
    const status = str(fd, 'status') as 'draft' | 'published' | 'archived';
    await setArticleStatus(sql, id, status, p.id);
    return { ok: status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Moved back to draft' };
  });
}

export async function subscribeAction(fd: FormData) {
  await attempt(back(fd, '/blog'), async () => {
    if (str(fd, 'company')) return; // bot trap
    await subscribeNewsletter(sql, str(fd, 'email'), str(fd, 'source') || 'blog');
    return { ok: 'You are on the list. Check your inbox.' };
  });
}
