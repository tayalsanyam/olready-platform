// End-to-end walkthrough of the real UI: bride, ops, vendor, content, in a phone-sized browser.
// Needs: dev server on BASE_URL with DEV_AUTH=1 and fresh demo data (npm run db:reset).
// Usage: node tests/e2e/walkthrough.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
// RFC 6238 code from a base32 secret, for the sign-in code step.
import { createHmac } from 'node:crypto';
function totp(secret, now = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}


const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? 'walkthrough-shots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let n = 0;
const steps = [];
const overflow = [];
async function shot(name) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) overflow.push(`${name} (${new URL(page.url()).pathname}): ${w}px wide`);
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
}
async function step(name, fn) {
  try {
    await fn();
    steps.push(['ok', name]);
    console.log('✓', name);
  } catch (e) {
    steps.push(['FAIL', name, e.message.split('\n')[0]]);
    console.log('✗', name, '\n   ', e.message.split('\n')[0], (e.stack.match(/walkthrough.mjs:(\d+)/g) || []).join(' '));
    await shot(`FAIL-${name.replace(/[^a-z0-9]+/gi, '-')}`);
  }
}
const go = (path) => page.goto(BASE + path, { waitUntil: 'networkidle' });
const see = async (text) => {
  await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
};
const ok = async () => {
  const err = page.locator('[data-notice=error]');
  if (await err.count()) throw new Error('Error shown: ' + (await err.first().innerText()));
};
/** Clicks a button that submits a server action and waits for the action and any redirect to finish. */
async function submit(locator) {
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().startsWith(BASE), { timeout: 15000 }),
    locator.click(),
  ]);
  await req.response().catch(() => null);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await page.waitForLoadState('networkidle');
}

/** Types into a town (or area) box and picks the first suggestion containing `option`. */
async function pickPlace(label, text, option) {
  const box = page.getByLabel(label, { exact: true });
  await box.fill(text);
  await page.getByRole('option').filter({ hasText: option }).first().click({ timeout: 8000 });
}
const istDay = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

async function signInAs(name) {
  await go('/dev-login');
  const signOut = page.getByRole('button', { name: /^Sign out/ });
  if (await signOut.count()) {
    await submit(signOut);
    await page.waitForURL((u) => u.pathname === '/');
    await go('/dev-login');
  }
  await submit(page.locator('li', { hasText: name }).getByRole('button', { name: 'Sign in' }));
  await page.waitForURL((u) => !u.pathname.startsWith('/dev-login'));
}

// ------------------------------------------------------------------ anonymous bride
await step('home search lands on a city × category page', async () => {
  await go('/');
  await shot('home');
  await page.getByLabel('Vendor type').selectOption('bridal-makeup');
  await page.locator('form[action="/vendors/go"]').getByRole('button', { name: 'Search' }).click();
  await page.waitForURL('**/vendors/chandigarh/bridal-makeup');
  await see('Bridal makeup artists in Chandigarh');
  await see('Glow by Kirti');
  await shot('listing');
});

await step('filter page shows only airbrush artists', async () => {
  await page.getByRole('link', { name: 'Airbrush makeup', exact: true }).click();
  await page.waitForURL('**/bridal-makeup/airbrush');
  await see('Airbrush makeup artists in Chandigarh');
  if (await page.getByText('Makeup by Ishita').count()) throw new Error('non-airbrush vendor shown');
});

await step('vendor profile hides contact details and carries JSON-LD', async () => {
  await go('/v/glow-by-kirti-demo');
  await see('Request a quote');
  const html = await page.content();
  if (html.includes('+919800000001') || html.includes('owner1@demo.in')) throw new Error('contact details leaked into HTML');
  if (!html.includes('"@type":"LocalBusiness"') || !html.includes('"@type":"FAQPage"')) throw new Error('missing JSON-LD');
  await see('Does Glow by Kirti travel to the venue?');
  await shot('profile');
});

await step('SEO files list landing pages', async () => {
  const sm = await (await page.request.get(BASE + '/sitemap.xml')).text();
  if (!sm.includes('/vendors/chandigarh/bridal-makeup')) throw new Error('landing page missing from sitemap');
  if (sm.includes('/vendors/panchkula/decorators/luxury')) throw new Error('thin page listed in sitemap');
  const llms = await (await page.request.get(BASE + '/llms.txt')).text();
  if (!llms.includes('Bridal makeup artists in Chandigarh')) throw new Error('llms.txt incomplete');
  const robots = await (await page.request.get(BASE + '/robots.txt')).text();
  if (!robots.includes('Disallow: /ops')) throw new Error('robots.txt does not hide ops');
});

await step('anonymous multi-category enquiry', async () => {
  await go('/enquire');
  await page.getByLabel('Your name *').fill('Priya Walkthrough');
  await page.getByLabel('Mobile number *').fill('98111 22233');
  await page.getByLabel('Email').fill('priya@demo.in');
  await pickPlace('Town or city *', 'Chandig', 'Chandigarh');
  await page.getByRole('checkbox', { name: 'Wedding photographers' }).check();
  await page.getByRole('checkbox', { name: 'DJs and dhol players' }).check();
  await page.getByLabel('Budget for Wedding photographers').fill('90000');
  await shot('enquiry');
  await page.getByRole('button', { name: 'Send my request' }).click();
  await page.waitForURL('**/enquire/thanks');
  await see('Request received');
});

// ------------------------------------------------------------------ bride signs in
await step('bride sets up her wedding and gets a dated checklist', async () => {
  await signInAs('Simran Kaur');
  await page.waitForURL('**/me');
  await page.getByLabel('Call it').fill('Simran weds Arjun');
  await page.getByLabel("Partner's name").fill('Arjun');
  await page.getByLabel('Wedding date').fill('2027-02-14');
  await submit(page.getByRole('button', { name: 'Start planning' }));
  await ok();
  await see('Simran weds Arjun');
  await see('We will call you to verify');
  await shot('bride-home');
  await go('/me/checklist');
  await see('Book the venue');
  await see('14 May 2026');
});

await step('bride shortlists two vendors', async () => {
  for (const slug of ['frames-and-phere-demo', 'marigold-decor-co-demo']) {
    await go(`/v/${slug}`);
    await submit(page.getByRole('button', { name: 'Shortlist', exact: true }).filter({ visible: true }).first());
    await see('Added to your shortlist');
  }
  await go('/me/shortlist');
  await see('Frames & Phere');
  await see('Send to 2 categories');
  await shot('shortlist');
});

await step('bride adds guests and a guest answers the RSVP link', async () => {
  await go('/me/guests');
  await page.locator('textarea[name=lines]').fill('Uncle Raj, 9876512345\nAunty Neeta');
  await submit(page.getByRole('button', { name: 'Add guests' }));
  await see('Added 2 guests');
  const href = await page.getByRole('link', { name: 'link' }).first().getAttribute('href');
  await go(href);
  for (const r of await page.locator('input[type=radio][value=yes]').all()) await r.check();
  await page.locator('input[type=number]').first().fill('3');
  await submit(page.getByRole('button', { name: 'Send my reply' }));
  await see('your reply is saved');
  await shot('rsvp');
  await go('/me/guests');
  await see('Mehendi');
});

await step('bride publishes an e-invite', async () => {
  await go('/me/invite');
  await page.getByLabel("Bride's name *").fill('Simran');
  await page.getByLabel("Groom's name *").fill('Arjun');
  await submit(page.getByRole('button', { name: 'Save invite' }));
  await see('Invite saved');
  const href = await page.getByRole('link', { name: 'Open my invite' }).getAttribute('href');
  await go(href);
  await see('Simran');
  await see('Arjun');
  await shot('invite');
});

// ------------------------------------------------------------------ ops verifies
await step('ops verifies the lead and adds decor on the call', async () => {
  await signInAs('Rohit (ops)');
  await go('/ops/leads');
  await page.getByRole('link', { name: 'Simran Kaur' }).click();
  await page.waitForLoadState('networkidle');
  await see('Ask about each of these');
  await shot('ops-call-script');
  const decor = page.locator('form', { hasText: 'Wedding decorator' }).filter({ has: page.getByRole('button', { name: 'Add' }) });
  await decor.getByPlaceholder('Budget ₹').fill('200000');
  await submit(decor.getByRole('button', { name: 'Add' }));
  await see('Category added');
  for (const label of ['Done', 'Done', 'Mark verified']) {
    await submit(page.getByRole('button', { name: label, exact: true }));
    await ok();
  }
  await see('Vendors can now see this lead');
});

// ------------------------------------------------------------------ vendor unlocks and quotes
await step('makeup vendor sees the lead and unlocks it', async () => {
  await signInAs('Glow by Kirti owner');
  await page.waitForURL('**/vendor');
  await see('Simran');
  await see('3 more categories');
  await shot('vendor-leads');
  await submit(page.getByRole('button', { name: /Unlock for 1 credit/ }).first());
  await see('Unlocked for 1 credit');
  await see('+919876543210');
});

await step('vendor messages and sends a quote', async () => {
  await page.getByPlaceholder('Write a message').fill('Hi Simran, congratulations! I would love to do your bridal look.');
  await submit(page.getByRole('button', { name: 'Send', exact: true }));
  await page.getByLabel('Send a quote (₹)').fill('24000');
  await page.getByPlaceholder('What is included').fill('Bridal look with HD airbrush, hair and draping');
  await submit(page.getByRole('button', { name: 'Send quote' }));
  await see('Quote sent');
  await shot('vendor-thread');
});

await step('photographer sees the shortlisted lead first', async () => {
  await signInAs('Frames & Phere owner');
  await see('Simran');
});

// ------------------------------------------------------------------ bride accepts and reports booking
await step('bride accepts the quote and reports the booking', async () => {
  await signInAs('Simran Kaur');
  await see('1 vendor replied');
  await page.getByRole('link', { name: /Glow by Kirti/ }).click();
  await page.waitForLoadState('networkidle');
  if (await page.getByText('+919876543210').count()) throw new Error('bride sees phone block meant for vendors');
  await submit(page.getByRole('button', { name: 'Accept' }));
  await see('Quote accepted');
  await submit(page.getByRole('button', { name: 'Report booking' }));
  await see('Congratulations');
  await go('/me');
  await see('Booked: Glow by Kirti');
  await see('7 days of relationship-manager help');
  await shot('bride-booked');
});

await step('bride reviews the artist and the service separately', async () => {
  await go('/me/reviews');
  const card = page.locator('.card', { hasText: 'Glow by Kirti' });
  await card.locator('input[name=rating_artist][value="5"]').check({ force: true });
  await card.locator('input[name=rating_service][value="3"]').check({ force: true });
  await card.locator('textarea[name=body]').fill('Beautiful work, but arrived an hour late.');
  await submit(card.getByRole('button', { name: 'Save review' }));
  await see('Thank you for your review');
  await go('/v/glow-by-kirti-demo');
  await see('Booked via OLReady');
  await see('Work 5/5, service 3/5');
});

await step('bride shares a real wedding for review', async () => {
  await go('/me/real-wedding');
  await page.getByLabel('Couple names *').fill('Simran & Arjun');
  await page.getByLabel('Title *').fill('A February wedding');
  await page.getByLabel('Vendors (OLReady profile links)').fill('/v/glow-by-kirti-demo');
  await page.getByRole('checkbox').check();
  await submit(page.getByRole('button', { name: 'Submit for review' }));
  await see('reviews every story');
});

// ------------------------------------------------------------------ vendor disputes, buys credits
await step('vendor disputes the review', async () => {
  await signInAs('Glow by Kirti owner');
  await go('/vendor/reviews');
  await page.getByText('This review is false').click();
  await page.getByPlaceholder('Why is it false?').fill('We arrived on time; the venue gate was closed.');
  await submit(page.getByRole('button', { name: 'Open a dispute' }));
  await see('within 48 hours');
});

await step('vendor buys a top-up and a plan', async () => {
  await go('/vendor/packs');
  await shot('packs');
  const topup = page.locator('.card', { hasText: 'Top-up 10' });
  await topup.locator('select[name=gateway]').selectOption('test');
  await topup.locator('input[name=accept_terms]').check();
  await submit(topup.getByRole('button', { name: 'Buy Top-up 10' }));
  await submit(page.getByRole('button', { name: 'Complete test payment' }));
  await see('Payment received');
  await see('19 top-up credits');
  const pro = page.locator('.card', { hasText: '60 verified enquiries' });
  await pro.locator('select[name=gateway]').selectOption('test');
  await pro.locator('input[name=accept_terms]').check();
  await submit(pro.getByRole('button', { name: 'Buy Pro' }));
  await submit(page.getByRole('button', { name: 'Complete test payment' }));
  await see('activates once our team has your signed contract');
  await page.getByRole('link', { name: 'Receipt' }).first().click();
  await page.waitForLoadState('networkidle');
  await see('Payment receipt');
});

// ------------------------------------------------------------------ ops: plan, dispute, content
await step('ops activates the plan once the contract is in; the invoice was issued on payment', async () => {
  await signInAs('Rohit (ops)');
  await go('/ops/payments');
  // The tax invoice is issued on payment; Ops only adds the signed contract.
  await page.getByPlaceholder('Signed contract link').fill('https://sign.zoho.in/demo-contract');
  await submit(page.getByRole('button', { name: 'Activate plan' }));
  await see('Plan activated');
});

await step('ops runs the dispute through contact and decision', async () => {
  await go('/ops/reviews');
  await see('h left');
  await submit(page.getByRole('button', { name: 'I contacted the vendor' }));
  await see('7 days to send proof');
  await signInAs('Glow by Kirti owner');
  await go('/vendor/reviews');
  await page.getByPlaceholder('Booking records, chat logs, links').fill('Gate log screenshot: https://example.com/gate.jpg');
  await submit(page.getByRole('button', { name: 'Send proof' }));
  await signInAs('Rohit (ops)');
  await go('/ops/reviews');
  await page.getByPlaceholder('Reason for the decision').fill('Proof does not cover arrival time');
  await submit(page.getByRole('button', { name: 'Keep review' }));
  await see('Decision recorded');
});

await step('content team publishes the real wedding', async () => {
  await signInAs('Meera (content)');
  await go('/ops/content');
  await see('Simran & Arjun');
  await submit(page.getByRole('button', { name: 'Publish' }));
  await go('/real-weddings');
  await see('Simran & Arjun');
  await go('/v/glow-by-kirti-demo');
  await see('Simran & Arjun');
  await see('A February wedding');
});

await step('vendor uploads work photos and the first becomes the cover', async () => {
  await signInAs('Glow by Kirti owner');
  await go('/vendor/profile');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.locator('input[type=file][name=photos]').setInputFiles([
    { name: 'look1.png', mimeType: 'image/png', buffer: png },
    { name: 'look2.png', mimeType: 'image/png', buffer: png },
  ]);
  await see('2 photos ready');
  await submit(page.getByRole('button', { name: 'Add photos' }));
  await see('Added 2 photos');
  await see('Cover');
  const fake = Buffer.from('this is not an image');
  await page.locator('input[type=file][name=photos]').setInputFiles([{ name: 'bad.png', mimeType: 'image/png', buffer: fake }]);
  await submit(page.getByRole('button', { name: 'Add photos' }));
  await see('Photos must be JPEG, PNG or WebP');
  await go('/v/glow-by-kirti-demo');
  if (!(await page.locator('img[src^="/uploads/vendors/"]').count())) throw new Error('uploaded photo not on profile');
});

await step('bride starts her booking perk and Ops assigns an RM who can read her chats', async () => {
  await signInAs('Simran Kaur');
  await go('/me');
  await submit(page.getByRole('button', { name: 'Start now' }));
  await see('within one working day');
  await signInAs('Rohit (ops)');
  await go('/ops/rm');
  await see('booking perk');
  const rmSelect = page.locator('select[name=rm_profile_id]').first();
  await rmSelect.selectOption(await rmSelect.locator('option', { hasText: 'Tanya' }).getAttribute('value'));
  await submit(page.getByRole('button', { name: 'Assign' }));
  await see('Relationship manager assigned');
  await signInAs('Tanya (RM)');
  await go('/ops/rm');
  await page.getByRole('link', { name: /Simran Kaur/ }).click();
  await page.waitForLoadState('networkidle');
  await see('Glow by Kirti');
  await page.locator('textarea[name=body]').fill('Called Simran. Wants a candid photographer under 1 lakh.');
  await submit(page.getByRole('button', { name: 'Save' }));
  await see('Note saved');
  await page.getByRole('link', { name: 'Glow by Kirti' }).first().click();
  await page.waitForLoadState('networkidle');
  await see('read only');
  await shot('rm-thread');
  await signInAs('Simran Kaur');
  await go('/me/rm');
  await see('is your relationship manager');
});

await step('a second bride buys the RM service, pays, and waits for approval', async () => {
  await signInAs('Neha Gupta');
  await go('/me');
  await submit(page.getByRole('button', { name: 'Start planning' }));
  await go('/me/rm');
  await page.locator('select[name=gateway]').selectOption('test');
  await page.locator('input[name=accept_terms]').check();
  await submit(page.getByRole('button', { name: 'Get a relationship manager' }));
  await see('Pay for Relationship manager');
  await submit(page.getByRole('button', { name: 'Complete test payment' }));
  await see('Payment received');
  await see('assigns your relationship manager within one working day');
});

await step('emails were queued for the key events', async () => {
  const res = await page.request.get(BASE + '/api/cron/daily', { headers: { authorization: 'Bearer local-cron' } });
  const j = await res.json();
  if (typeof j.rmEnded !== 'number' || !j.expiredPlans) throw new Error('cron response missing fields');
});

await step('ops employee cannot export; admin can', async () => {
  await signInAs('Rohit (ops)');
  const denied = await page.request.get(BASE + '/ops/export?table=leads');
  if (denied.status() !== 403) throw new Error(`ops export returned ${denied.status()}`);
  await signInAs('Asha (admin)');
  const okRes = await page.request.get(BASE + '/ops/export?table=leads');
  if (okRes.status() !== 200 || !(await okRes.text()).includes('Simran Kaur')) throw new Error('admin export failed');
});

await step('admin opens florists, the category gets its own pages', async () => {
  await go('/ops/catalog');
  await page.getByRole('link', { name: 'Florists' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Open to brides and vendors').check();
  await submit(page.getByRole('button', { name: 'Save', exact: true }).first());
  await see('Saved');
  await go('/vendors/chandigarh/florists');
  await see('Florists in Chandigarh');
  await see('No florists in chandigarh listed yet');
});

await step('admin gives a new teammate Ops access; the price list follows Ops', async () => {
  await go('/ops/staff');
  await see('Sync from the sales-site admin');
  const form = page.locator('form', { hasText: 'Give access' });
  await form.getByLabel('Email').fill('newops@olready.in');
  await form.getByLabel('Role').selectOption('ops');
  await submit(form.getByRole('button', { name: 'Give access' }));
  await ok();
  await see('newops@olready.in is now ops');
  await shot('ops-staff');
  const packs = await (await page.request.get(BASE + '/api/public/packs')).json();
  const pro = packs.packs.find((p) => p.code === 'pro');
  if (!pro || pro.price_inr !== 18999 || !packs.gst_included) throw new Error('price list wrong: ' + JSON.stringify(pro));
});

// ------------------------------------------------------------------ features added since the first walkthrough
await step('bride compares quotes with the AI reading and sets a budget', async () => {
  await signInAs('Simran Kaur');
  await go('/me/compare');
  await see('Glow by Kirti');
  await see('Included');
  await see('Worth asking');
  await shot('compare-quotes');
  await go('/me/budget');
  await page.getByLabel('Total wedding budget (₹)').fill('2500000');
  await submit(page.getByRole('button', { name: 'Save', exact: true }).first());
  await ok();
  await see('Likely total');
  await shot('budget');
});

await step('bride asks OLReady and confirms a shortlist card', async () => {
  await go('/me/assistant');
  await shot('assistant-start');
  await page.getByLabel('Your question').fill('Find a venue for 300 guests');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Confirm' }).waitFor({ timeout: 30000 });
  await shot('assistant-answer');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('Done', { exact: true }).waitFor();
  await go('/me/shortlist');
  await see('Rosewood Banquets');
});

await step('bride browses ideas, guides, search and invitation designs', async () => {
  for (const [path, text] of [
    ['/ideas', 'Ideas'],
    ['/blog', 'Guides'],
    ['/search?q=glow', 'Glow by Kirti'],
    ['/invitations', 'Invitation'],
    ['/look', 'photo'],
    ['/real-weddings', 'Real weddings'],
  ]) {
    await go(path);
    await see(text);
  }
  await go('/ideas');
  await shot('ideas');
  await go('/invitations');
  await shot('invitations');
});

await step('vendor sees insights, tops up the ads wallet and starts a Boost', async () => {
  await signInAs('Glow by Kirti owner');
  await go('/vendor/insights');
  await see('Profile views by day');
  await shot('vendor-insights');
  await go('/vendor/promote');
  await page.locator('select[name=gateway]').first().selectOption('test');
  await page.locator('form', { has: page.getByRole('button', { name: 'Top up' }) }).locator('input[name=accept_terms]').check();
  await submit(page.getByRole('button', { name: 'Top up' }));
  await submit(page.getByRole('button', { name: 'Complete test payment' }));
  await go('/vendor/promote');
  await submit(page.getByRole('button', { name: /Start (the )?Boost/ }));
  await ok();
  await see('Pause');
  await shot('vendor-promote');
});

await step('vendor opens the GST invoice for a purchase', async () => {
  await go('/vendor/packs');
  const link = page.getByRole('link', { name: /^Invoice OLR\// }).first();
  const href = await link.getAttribute('href');
  const res = await page.request.get(BASE + href);
  if (res.status() !== 200 || !String(res.headers()['content-type']).includes('application/pdf')) throw new Error(`invoice: ${res.status()} ${res.headers()['content-type']}`);
  const body = await res.body();
  if (body.subarray(0, 5).toString() !== '%PDF-') throw new Error('invoice is not a PDF');
});

await step('ops uses Data, Ask the data, WhatsApp and the Ask OLReady review', async () => {
  await signInAs('Rohit (ops)');
  await go('/ops/data/leads?status=verified');
  await see('Simran Kaur');
  await shot('ops-data');
  if (await page.getByRole('link', { name: 'Download CSV' }).count()) throw new Error('ops employee offered a download');
  await go('/ops/assistant');
  await submit(page.getByRole('button', { name: /How many leads were verified/ }));
  await see('rows');
  await shot('ops-ask-the-data');
  await go('/ops/whatsapp');
  await see('Send a test');
  await go('/ops/bride-ai');
  await see('Answers to review');
});

await step('admin downloads a filtered list', async () => {
  await signInAs('Asha (admin)');
  await go('/ops/data/vendors?city=chandigarh');
  const href = await page.getByRole('link', { name: 'Download CSV' }).getAttribute('href');
  const res = await page.request.get(BASE + href);
  const csv = await res.text();
  if (res.status() !== 200 || !csv.startsWith('id,')) throw new Error(`export: ${res.status()}`);
  if (!csv.includes('Chandigarh') || csv.includes(',Mohali,')) throw new Error('export ignored the city filter');
});

await step('admin turns on a sign-in code and needs it to get back into Ops', async () => {
  await go('/mfa');
  await submit(page.getByRole('button', { name: 'Start setup' }));
  const key = (await page.getByText('Or type this key:').innerText()).replace('Or type this key:', '').trim();
  await shot('mfa-setup');
  await page.getByLabel('6-digit code').fill(totp(key));
  await submit(page.getByRole('button', { name: 'Turn on and continue' }));
  await page.waitForURL((u) => u.pathname.startsWith('/ops'));
  // A fresh sign-in asks again; the same 30-second code cannot be used twice, so wait for the next one.
  await signInAs('Asha (admin)');
  await go('/ops/settings');
  await page.waitForURL((u) => u.pathname === '/mfa');
  await page.waitForTimeout(31000 - (Date.now() % 30000));
  await page.getByLabel('6-digit code').fill(totp(key));
  await submit(page.getByRole('button', { name: 'Continue' }));
  await page.waitForURL((u) => u.pathname.startsWith('/ops'));
});

// ------------------------------------------------------------------ policies, price guides, big days
await step('visitor reads the policies, a price guide and the directory, and writes in', async () => {
  const signOut = async () => {
    await go('/dev-login');
    const b = page.getByRole('button', { name: /^Sign out/ });
    if (await b.count()) await submit(b);
  };
  await signOut();
  for (const [path, text] of [['/terms', 'Terms of use'], ['/privacy', 'Privacy policy'], ['/refunds', 'Refunds'], ['/about', 'OLReady']]) {
    await go(path);
    await see(text);
  }
  await go('/cost/venues/chandigarh');
  await see('Wedding venue cost in Chandigarh');
  await see('Lowest starting prices');
  await shot('price-guide');
  const ld = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  if (!ld.some((s) => s.includes('FAQPage'))) throw new Error('price guide has no FAQ markup');
  await go('/directory');
  await see('Airbrush makeup artists in Chandigarh');
  const sm = await (await page.request.get(BASE + '/sitemap.xml')).text();
  if (!sm.includes('/cost/venues/chandigarh') || !sm.includes('/directory') || !sm.includes('<image:loc>')) throw new Error('sitemap is missing price guides, the directory or images');
  const og = await page.request.get(BASE + '/cost/venues/chandigarh/opengraph-image');
  if (og.headers()['content-type'] !== 'image/png') throw new Error('price guide share image missing');
  await go('/contact');
  await page.getByLabel('Your name').fill('Kavya Visitor');
  await page.getByLabel('Email').fill('kavya@demo.in');
  await page.getByLabel('Message').fill('Do you list venues in Zirakpur as well? We are looking for February.');
  await submit(page.getByRole('button', { name: 'Send message' }));
  await ok();
  await see('Thanks');
});

await step('a bride asks for three functions and says which ones the photographer covers', async () => {
  await go('/enquire');
  await page.getByLabel('Your name *').fill('Neha Functions');
  await page.getByLabel('Mobile number *').fill('98222 33344');
  // A pincode alone picks the town and the area.
  await pickPlace('Town or city *', '160022', '160022');
  await page.waitForFunction(() => [...document.querySelectorAll('input[role=combobox]')].some((i) => i.value.startsWith('Chandigarh')), null, { timeout: 5000 }).catch(() => {
    throw new Error('pincode did not pick the town');
  });
  await page.getByRole('button', { name: '+ Mehendi' }).click();
  await page.getByRole('button', { name: '+ Reception' }).click();
  await page.getByLabel('Date of Wedding').fill('2027-02-14');
  await page.getByLabel('Date of Mehendi').fill('2027-02-12');
  await page.getByLabel('Date of Reception').fill('2027-02-15');
  await page.getByLabel('Guests at Wedding').fill('300');
  await page.getByLabel('Guests at Reception').fill('450');
  await page.getByRole('checkbox', { name: 'Wedding photographers' }).check();
  await page.getByRole('group', { name: 'Functions for Wedding photographers' }).getByRole('button', { name: 'Mehendi' }).click();
  await shot('enquiry-functions');
  await page.getByRole('button', { name: 'Send my request' }).click();
  await page.waitForURL('**/enquire/thanks');
  await see('Request received');
});

await step('ops sees the functions and the contact message, and verifies the request', async () => {
  await signInAs('Rohit (ops)');
  await go('/ops');
  await see('Contact messages');
  await see('Kavya Visitor');
  await go('/ops/leads');
  await page.getByRole('link', { name: 'Neha Functions' }).click();
  await page.waitForLoadState('networkidle');
  await see('Mehendi');
  await see('450 guests');
  await shot('ops-functions');
  for (let i = 0; i < 6 && (await page.getByRole('button', { name: 'Done', exact: true }).count()); i++) {
    await submit(page.getByRole('button', { name: 'Done', exact: true }).first());
    await ok();
  }
  await submit(page.getByRole('button', { name: 'Mark verified', exact: true }));
  await ok();
  await see('Vendors can now see this lead');
});

await step('photographer quotes the wedding and reception separately', async () => {
  await signInAs('Frames & Phere owner');
  const card = page.locator('li.card', { hasText: 'Neha' });
  await card.waitFor({ timeout: 8000 });
  if (!(await card.innerText()).includes('Reception')) throw new Error('lead card does not list the functions');
  if ((await card.innerText()).includes('Mehendi')) throw new Error('photographer shown a function they are not needed for');
  await go('/vendor/packs');
  const topup = page.locator('.card', { hasText: 'Top-up 10' });
  await topup.locator('select[name=gateway]').selectOption('test');
  await topup.locator('input[name=accept_terms]').check();
  await submit(topup.getByRole('button', { name: 'Buy Top-up 10' }));
  await submit(page.getByRole('button', { name: 'Complete test payment' }));
  await see('Payment received');
  await go('/vendor');
  await card.waitFor({ timeout: 8000 });
  await submit(card.getByRole('button', { name: /Unlock for/ }));
  await see('Unlocked for');
  await page.getByLabel('Price for Wedding').fill('60000');
  await page.getByLabel('Price for Reception').fill('40000');
  await page.getByPlaceholder('What is included').fill('Candid and traditional, two shooters each day, edited album');
  await submit(page.getByRole('button', { name: 'Send quote' }));
  await see('Quote sent');
  await see('1,00,000');
  await shot('quote-per-function');
});

// ------------------------------------------------------------------ places and calendars
await step('vendor adds their area and street address, shown on their page', async () => {
  await signInAs('Glow by Kirti owner');
  await go('/vendor/profile');
  await pickPlace('Area or pincode (optional)', 'Sector 3', 'Sector 35');
  await page.getByLabel('Street address').fill('SCO 12, Sector 35-C');
  await page.getByLabel('Show my full address and map on my page').check();
  await submit(page.getByRole('button', { name: 'Save address' }));
  await ok();
  await see('Address saved');
  await go('/v/glow-by-kirti-demo');
  await see('SCO 12, Sector 35-C');
  await see('Open in Maps');
});

await step('vendor marks a date booked; brides see it on the profile and in listings', async () => {
  await go('/vendor/calendar');
  await see('My calendar is up to date');
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Mark on calendar' }) });
  await form.getByLabel('From').fill(istDay(70));
  await form.getByLabel('Note for you (private)').fill('Walkthrough booking');
  await submit(form.getByRole('button', { name: 'Mark on calendar' }));
  await ok();
  await see('Date marked');
  await shot('vendor-calendar');
  await go(`/v/glow-by-kirti-demo?date=${istDay(70)}`);
  await see(': booked');
  if (await page.getByText('Walkthrough booking').count()) throw new Error('private note shown to brides');
  await go(`/v/glow-by-kirti-demo?date=${istDay(71)}`);
  await see('free as per their calendar');
  await go(`/vendors/chandigarh/bridal-makeup?date=${istDay(70)}`);
  await see('Free on');
  if (await page.getByRole('heading', { name: 'Glow by Kirti' }).count()) throw new Error('booked vendor listed as free');
  await shot('listing-free-on');
});

await step('India-wide pages, area search and Ops places', async () => {
  await go('/vendors/india/venues');
  await see('Wedding venues in India');
  await see('By town');
  const r = await page.request.get(BASE + '/api/public/places?q=gurgaon');
  const j = await r.json();
  if (j.places?.[0]?.city !== 'Gurugram') throw new Error('old town names do not resolve');
  await signInAs('Rohit (ops)');
  await go('/ops/places?q=jaipur&show=all');
  await see('Jaipur');
  await see('pincodes');
  await shot('ops-places');
});

await step('cron endpoint needs its secret', async () => {
  const no = await page.request.get(BASE + '/api/cron/daily');
  if (no.status() !== 401) throw new Error('cron open without secret');
  const yes = await page.request.get(BASE + '/api/cron/daily', { headers: { authorization: 'Bearer local-cron' } });
  if (yes.status() !== 200) throw new Error('cron failed with secret');
});

await browser.close();
const failed = steps.filter((s) => s[0] === 'FAIL');
console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
if (consoleErrors.length) console.log('Browser errors:', consoleErrors);
if (overflow.length) console.log('Pages wider than the phone screen:', overflow);
process.exit(failed.length || overflow.length ? 1 : 0);
