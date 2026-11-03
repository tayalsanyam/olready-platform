// HTTP sweep of a running OLReady (default http://localhost:3000, dev sign-in on):
//   1. every URL in the sitemap answers 200, with valid JSON-LD
//   2. no vendor phone number or email appears in any public page or a bride's pages
//   3. each role reaches the routes it should and is turned away from the rest
// Usage: DATABASE_URL=... node tests/e2e/sweep.mjs [baseUrl]
// Run on fresh demo data (npm run db:reset): staff with an authenticator turned on are
// correctly sent to /mfa, which the access matrix does not expect.
import postgres from 'postgres';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
const problems = [];
const fail = (s) => problems.push(s);

// ---------------------------------------------------------------- contact details to look for
const contacts = await db`select business_name, phone, email from mkt.vendors where phone is not null or email is not null`;
const needles = [];
for (const c of contacts) {
  if (c.phone) {
    const d = c.phone.replace(/\D/g, '').slice(-10);
    if (d.length === 10) needles.push({ what: `${c.business_name} phone`, re: new RegExp(d.split('').join('[\\s-]?')) });
  }
  if (c.email) needles.push({ what: `${c.business_name} email`, re: new RegExp(c.email.replace(/[.+]/g, '\\$&'), 'i') });
}
const scan = (where, html) => {
  for (const n of needles) if (n.re.test(html)) fail(`${where}: shows ${n.what}`);
};

// ---------------------------------------------------------------- 1 and 2: the public site
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, BASE));
const extra = ['/search?q=makeup', '/ideas', '/blog', '/real-weddings', '/invitations', '/look', '/enquire', '/vendors'];
let checked = 0;
let ld = 0;
const queue = [...new Set([...urls, ...extra.map((p) => BASE + p)])];
async function worker() {
  while (queue.length) {
    const u = queue.shift();
    const res = await fetch(u, { redirect: 'manual' });
    checked++;
    if (res.status !== 200) {
      fail(`${u.replace(BASE, '')}: ${res.status}`);
      continue;
    }
    const html = await res.text();
    scan(u.replace(BASE, ''), html);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const data = JSON.parse(m[1]);
        for (const d of [data].flat()) if (!d['@context'] || !d['@type']) fail(`${u.replace(BASE, '')}: JSON-LD without @context/@type`);
        ld++;
      } catch {
        fail(`${u.replace(BASE, '')}: JSON-LD does not parse`);
      }
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`public: ${checked} pages, ${ld} JSON-LD blocks, ${urls.length} from the sitemap`);

// ---------------------------------------------------------------- 3: roles and routes
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function as(name) {
  const ctx = await browser.newContext();
  if (name) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev-login`, { waitUntil: 'networkidle' });
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dev-login')), page.locator('li', { hasText: name }).getByRole('button', { name: 'Sign in' }).click()]);
    await page.close();
  }
  return ctx;
}
const [invoice] = await db`select d.id, p.full_name as buyer from mkt.tax_documents d join mkt.orders o on o.id = d.order_id join mkt.profiles p on p.id = o.profile_id order by d.issued_at limit 1`;

// ok = 200; login = sent to sign in; away = sent elsewhere (denied); no = 403/404
const ROUTES = ['/me', '/me/assistant', '/me/budget', '/vendor', '/vendor/packs', '/ops', '/ops/leads', '/ops/data', '/ops/data/vendors', '/ops/assistant', '/ops/bride-ai', '/ops/whatsapp', '/ops/settings', '/ops/staff', '/ops/content', '/ops/rm', '/ops/export?set=vendors', ...(invoice ? [`/invoices/${invoice.id}`] : [])];
const EXPECT = {
  visitor: { default: 'login', '/ops/export?set=vendors': 'no', [`/invoices/${invoice?.id}`]: 'login' },
  // Simran has no wedding plan yet, so Budget sends her to set one up.
  'Simran Kaur': { '/me': 'ok', '/me/assistant': 'ok', '/me/budget': ['ok', 'away'], '/vendor': 'away', '/vendor/packs': 'away', default: 'away', '/ops/export?set=vendors': 'no', [`/invoices/${invoice?.id}`]: 'no' },
  'Glow by Kirti owner': { '/me': 'away', '/me/assistant': 'ok', '/me/budget': 'away', '/vendor': 'ok', '/vendor/packs': 'ok', default: 'away', '/ops/export?set=vendors': 'no', [`/invoices/${invoice?.id}`]: invoice?.buyer === 'Glow by Kirti owner' ? 'ok' : 'no' },
  'Meera (content)': { '/ops': 'ok', '/ops/content': 'ok', '/me': 'away', '/me/assistant': 'ok', '/me/budget': 'away', default: 'away', '/ops/export?set=vendors': 'no', [`/invoices/${invoice?.id}`]: 'no' },
  'Tanya (RM)': { '/ops': 'ok', '/ops/rm': 'ok', '/me': 'away', '/me/assistant': 'ok', '/me/budget': 'away', default: 'away', '/ops/export?set=vendors': 'no', [`/invoices/${invoice?.id}`]: 'no' },
  'Rohit (ops)': { default: 'ok', '/me': 'away', '/me/budget': 'away', '/vendor': 'away', '/vendor/packs': 'away', '/ops/settings': 'away', '/ops/staff': 'away', '/ops/export?set=vendors': 'no' },
  'Asha (admin)': { default: 'ok', '/me': 'away', '/me/budget': 'away', '/vendor': 'away', '/vendor/packs': 'away' },
};
const results = {};
for (const [who, exp] of Object.entries(EXPECT)) {
  const ctx = await as(who === 'visitor' ? null : who);
  results[who] = {};
  for (const r of ROUTES) {
    const res = await ctx.request.get(BASE + r, { maxRedirects: 0 });
    // Pages under a loading screen stream a 200 first and redirect inside the page.
    const body = res.status() === 200 ? await res.text() : '';
    const streamed = body.match(/NEXT_REDIRECT;(?:replace|push);([^;"]+);/);
    const loc = res.headers()['location'] ?? (streamed ? decodeURIComponent(streamed[1]) : '');
    const redirected = [301, 302, 303, 307, 308].includes(res.status()) || Boolean(streamed);
    const got = redirected ? (/\/login/.test(loc) ? 'login' : 'away') : res.status() === 200 ? 'ok' : [401, 403, 404].includes(res.status()) ? 'no' : String(res.status());
    if (redirected && body) scan(`${who} ${r} (redirected)`, body);
    results[who][r] = got;
    const want = exp[r] ?? exp.default;
    // Pages a signed-in non-bride can open on /me may show a notice instead; only "ok" vs not matters there.
    if (![want].flat().includes(got)) fail(`${who} ${r}: expected ${want}, got ${got}${loc ? ` → ${loc}` : ''}`);
    if (got === 'ok' && who === 'Simran Kaur') scan(`bride ${r}`, body);
  }
  await ctx.close();
}
await browser.close();
await db.end();

console.log('\naccess matrix:');
console.log(['route'.padEnd(26), ...Object.keys(EXPECT).map((w) => w.split(' ')[0].padEnd(8))].join(' '));
for (const r of ROUTES) console.log([r.slice(0, 26).padEnd(26), ...Object.keys(EXPECT).map((w) => results[w][r].padEnd(8))].join(' '));
console.log(problems.length ? `\n${problems.length} problems:\n- ${problems.join('\n- ')}` : '\nno problems');
process.exit(problems.length ? 1 : 0);
