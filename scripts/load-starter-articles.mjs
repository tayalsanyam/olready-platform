// Loads the starter guides into a real database as drafts, for the content team to edit and publish.
// Usage: DATABASE_URL=... node scripts/load-starter-articles.mjs
import postgres from 'postgres';
import { starterArticles } from './starter-articles.mjs';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
try {
  let added = 0;
  for (const a of starterArticles) {
    const [cat] = a.category ? await sql`select id from mkt.categories where slug = ${a.category}` : [null];
    const r = await sql`
      insert into mkt.articles (slug, title, excerpt, body, section, category_id, status, author_name)
      values (${a.slug}, ${a.title}, ${a.excerpt}, ${a.body}, ${a.section}, ${cat?.id ?? null}, 'draft', 'Olready team')
      on conflict (slug) do nothing returning id`;
    added += r.length;
  }
  console.log(`Added ${added} draft guides (existing ones left alone). Review them in Ops > Articles.`);
} finally {
  await sql.end();
}
