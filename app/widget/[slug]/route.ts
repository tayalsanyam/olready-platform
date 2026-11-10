import { sql } from '@/lib/db';
import { getVendorBySlug } from '@/lib/vendors';
import { reviewsForVendor } from '@/lib/reviews';
import { siteUrl } from '@/lib/seo';

// A vendor's rating and latest reviews, made to sit in an iframe on the vendor's own website.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const v = await getVendorBySlug(sql, (await params).slug);
  if (!v || v.status !== 'live') return new Response('Not found', { status: 404 });
  const reviews = (await reviewsForVendor(sql, v.id)).slice(0, 3);
  const profile = `${siteUrl()}/v/${v.slug}?utm_source=widget`;
  const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const items = reviews
    .map(
      (r) => `<li><div class="row"><b>${esc(r.author_name || 'A bride')}</b><span class="s">${stars((r.rating_artist + r.rating_service) / 2)}</span></div>${
        r.body ? `<p>${esc(r.body.length > 160 ? r.body.slice(0, 157) + '…' : r.body)}</p>` : ''
      }${r.verified_booking ? '<span class="tag">Booked via OLReady</span>' : ''}</li>`
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(v.business_name)} reviews on OLReady</title><meta name="robots" content="noindex">
<style>
*{box-sizing:border-box}body{margin:0;font:14px/1.45 "DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111014;background:#fff}
.w{border:1px solid #e7e3e7;border-radius:14px;padding:14px}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.r{background:#e2005e;color:#fff;border-radius:999px;padding:2px 10px;font-weight:600}
h1{font-size:16px;margin:0}small{color:#6b6870}
ul{list-style:none;margin:10px 0 0;padding:0}li{border-top:1px solid #e7e3e7;padding:8px 0}
.row{display:flex;justify-content:space-between}.s{color:#e2005e;letter-spacing:1px}
p{margin:4px 0 0;color:#333}.tag{display:inline-block;margin-top:4px;font-size:11px;color:#047857}
a.cta{display:block;margin-top:10px;text-align:center;color:#a60048;font-weight:600;text-decoration:none}
.brand{font-weight:700;letter-spacing:.04em}
</style></head><body><div class="w">
<div class="top"><div><h1>${esc(v.business_name)}</h1><small>${esc(v.category_name)}, ${esc(v.city_name)}</small></div>
${v.review_count ? `<span class="r">★ ${(v.rating ?? 0).toFixed(1)}</span>` : ''}</div>
${v.review_count ? `<small>${v.review_count} review${v.review_count === 1 ? '' : 's'} on <span class="brand">OLREADY</span></small><ul>${items}</ul>` : '<p>Reviews from OLReady brides will appear here.</p>'}
<a class="cta" href="${esc(profile)}" target="_blank" rel="noopener">See all reviews on OLReady</a></div></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'",
    },
  });
}
