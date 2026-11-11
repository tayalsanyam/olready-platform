// Demo data for local development and walkthroughs. Refuses to run in production.
// Every business and person here is fictional.
import postgres from 'postgres';
import { starterArticles } from './starter-articles.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });

const id = async (q) => (await q)[0].id;
const cat = (slug) => id(sql`select id from mkt.categories where slug = ${slug}`);
const city = (slug) => id(sql`select id from mkt.cities where slug = ${slug}`);

try {
  const [{ n }] = await sql`select count(*)::int as n from mkt.profiles`;
  if (n > 0) {
    console.log('Demo data already present; run db:reset to start over');
    process.exit(0);
  }
  // Demo people have a mobile on file, as real accounts must after their first sign-in.
  let demoPhone = 9800000000;
  const person = (email, full_name, role) =>
    id(sql`insert into mkt.profiles (email, full_name, role, phone) values (${email}, ${full_name}, ${role}, ${`+91${++demoPhone}`}) returning id`);
  const admin = await person('admin@demo.olready.in', 'Asha (admin)', 'admin');
  await person('ops@demo.olready.in', 'Rohit (ops)', 'ops');
  await person('content@demo.olready.in', 'Meera (content)', 'content');
  const rmId = await person('rm@demo.olready.in', 'Tanya (RM)', 'rm');
  await sql`update mkt.profiles set phone = '+919800099999' where id = ${rmId}`;
  const bride = await person('simran@demo.in', 'Simran Kaur', 'bride');
  const bride2 = await person('neha@demo.in', 'Neha Gupta', 'bride');

  const chd = await city('chandigarh');
  const moh = await city('mohali');
  const pkl = await city('panchkula');

  const vendors = [
    ['bridal-makeup', 'Glow by Kirti', chd, 22000, { artist_type: 'freelance', airbrush: true, hd: true, travels_to_venue: true, trial_policy: 'paid_adjusted', products: 'MAC, Huda Beauty' }, true, true],
    ['bridal-makeup', 'Studio Noor', moh, 35000, { artist_type: 'studio', airbrush: true, hd: true, travels_to_venue: false, trial_policy: 'paid' }, true, false],
    ['bridal-makeup', 'Makeup by Ishita', pkl, 15000, { artist_type: 'freelance', airbrush: false, hd: true, travels_to_venue: true, trial_policy: 'free' }, false, false],
    ['bridal-makeup', 'The Bridal Room', chd, 45000, { artist_type: 'studio', airbrush: true, hd: true, travels_to_venue: true, trial_policy: 'paid_adjusted' }, true, true],
    ['photographers', 'Frames & Phere', chd, 120000, { styles: ['candid', 'cinematic'], team_size: 4, delivery_weeks: 6, drone: true }, true, false],
    ['photographers', 'Lens Lore', moh, 85000, { styles: ['candid', 'traditional', 'pre_wedding'], team_size: 3, delivery_weeks: 8, drone: false }, true, false],
    ['photographers', 'Golden Hour Films', chd, 180000, { styles: ['cinematic', 'pre_wedding'], team_size: 5, delivery_weeks: 10, drone: true }, false, false],
    ['decorators', 'Marigold Decor Co', chd, 250000, { decor_type: 'mid', floral: true, functions: ['mehendi', 'sangeet', 'wedding'] }, true, false],
    ['decorators', 'Petal Story', pkl, 90000, { decor_type: 'budget', floral: true, functions: ['mehendi', 'wedding'] }, false, false],
    ['decorators', 'Grand Mandap', chd, 600000, { decor_type: 'luxury', floral: false, functions: ['wedding', 'reception'] }, true, false],
    ['mehendi-artists', 'Henna by Pooja', chd, 8000, { organic: true, team_size: 3, travels_to_venue: true }, true, false],
    ['mehendi-artists', 'Mehendi Mahal', moh, 12000, { organic: false, team_size: 6, travels_to_venue: true }, false, false],
    ['mehendi-artists', 'Rang Mehendi', chd, 6500, { organic: true, team_size: 2, travels_to_venue: true }, false, false],
    ['djs-dhol', 'DJ Baraat Beats', chd, 35000, { services: ['dj', 'sound'], hours_included: 5 }, true, false],
    ['djs-dhol', 'Punjab Dhol Crew', moh, 15000, { services: ['dhol'], hours_included: 3 }, false, false],
    ['djs-dhol', 'Sangeet Sound Co', chd, 28000, { services: ['dj', 'dhol', 'sound'], hours_included: 6 }, true, false],
    ['venues', 'Rosewood Banquets', chd, 1400, { venue_type: 'banquet', capacity_max: 600, non_veg_per_plate: 1700, rooms: 0, setting: ['indoor'], alcohol_allowed: true, outside_catering: false, outside_decor: true }, true, true],
    ['venues', 'Sukhna Greens Lawn', moh, 1100, { venue_type: 'lawn', capacity_max: 1500, non_veg_per_plate: 1350, setting: ['outdoor'], alcohol_allowed: true, outside_catering: true, outside_decor: true }, true, false],
    ['venues', 'Shivalik Courtyard Hotel', pkl, 2200, { venue_type: 'hotel', capacity_max: 250, non_veg_per_plate: 2600, rooms: 48, setting: ['indoor', 'poolside'], alcohol_allowed: true, outside_catering: false, outside_decor: false }, true, false],
    ['venues', 'Mango Orchard Farm', moh, 1600, { venue_type: 'farmhouse', capacity_max: 150, non_veg_per_plate: 1900, rooms: 6, setting: ['outdoor'], alcohol_allowed: true, outside_catering: true, outside_decor: true }, false, false],
    ['caterers', 'Tandoor Tales Catering', chd, 850, { food_type: 'veg_nonveg', cuisines: ['punjabi', 'north_indian', 'live_counters'], min_guests: 100, non_veg_per_plate: 1050 }, true, false],
    ['caterers', 'Shudh Rasoi', pkl, 650, { food_type: 'veg', cuisines: ['punjabi', 'south_indian', 'chinese'], min_guests: 50 }, true, false],
    ['planners', 'Shubh Vivah Planners', chd, 150000, { services: ['full', 'design'], weddings_done: 140, fee_model: 'fixed' }, true, false],
    ['planners', 'Day-Of Darlings', moh, 40000, { services: ['coordination'], weddings_done: 60, fee_model: 'fixed' }, false, false],
    ['bridal-wear', 'Zari Lane Couture', chd, 65000, { wear_type: ['lehenga', 'sharara'], rental: false, custom_made: true }, true, false],
    ['bridal-wear', 'Rent-a-Lehenga Studio', moh, 9000, { wear_type: ['lehenga', 'saree', 'sherwani'], rental: true, custom_made: false }, false, false],
    ['jewellery', 'Kundan Kothi Jewellers', chd, 180000, { jewellery_type: ['gold', 'kundan'], rental: false, certified: true }, true, false],
    ['jewellery', 'Glimmer Rentals', pkl, 7000, { jewellery_type: ['artificial', 'kundan'], rental: true, certified: false }, false, false],
  ];
  const slugs = {};
  let i = 0;
  for (const [c, name, cityId, price, attrs, verified, assured] of vendors) {
    const owner = await person(`owner${++i}@demo.in`, `${name} owner`, 'vendor');
    const slug = `${name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-demo`;
    slugs[name] = slug;
    const v = await id(sql`
      insert into mkt.vendors (owner_profile_id, category_id, city_id, service_city_ids, slug, business_name, tagline, about,
        starting_price_inr, years_experience, attributes, phone, email, status, claim_status, verified_at, assured)
      values (${owner}, ${await cat(c)}, ${cityId}, ${[chd, moh, pkl]}, ${slug}, ${name},
        ${'Tricity weddings since ' + (2012 + (i % 8))},
        ${`${name} is a fictional demo vendor used to walk through the Olready platform.`},
        ${price}, ${3 + (i % 9)}, ${sql.json(attrs)}, ${'+9198000000' + String(i).padStart(2, '0')}, ${`owner${i}@demo.in`},
        'live', 'claimed', ${verified ? sql`now()` : null}, ${assured})
      returning id`);
    if (i <= 2) {
      await sql`insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, note) values (${v}, 'topup', 10, 'adjustment', 'demo credits')`;
    }
  }
  // Work photos (original abstract placeholders) for every demo vendor except Glow by Kirti,
  // whose owner uploads photos during the walkthrough. Tags put them into the ideas gallery.
  const demoTags = {
    'bridal-makeup': [['glam', 'smokey-eyes'], ['subtle', 'hairstyles']],
    'mehendi-artists': [['arabic', 'minimal'], ['traditional', 'feet']],
    decorators: [['mandap', 'floral'], ['stage', 'lights']],
    venues: [['lawn', 'night'], ['banquet']],
    photographers: [['candid', 'couple-portraits'], ['pre-wedding']],
    'bridal-wear': [['red', 'gold'], ['pastel', 'pink']],
    jewellery: [['kundan', 'choker'], ['polki', 'maang-tikka']],
    caterers: [['live-counters', 'chaat'], ['desserts']],
    'djs-dhol': [['baraat', 'dhol'], ['sangeet']],
    planners: [[], []],
  };
  let photo = 0;
  for (const [c, name] of vendors) {
    if (name === 'Glow by Kirti') continue;
    const [{ id: vid }] = await sql`select id from mkt.vendors where slug = ${slugs[name]}`;
    const tagSets = demoTags[c] ?? [[], []];
    for (let k = 0; k < 2; k++) {
      const url = `/demo/demo-${(photo++ % 12) + 1}.jpg`;
      await sql`insert into mkt.vendor_media (vendor_id, url, caption, tags, sort) values (${vid}, ${url}, ${`${name}, sample ${k + 1}`}, ${tagSets[k]}, ${k})`;
      if (k === 0) await sql`update mkt.vendors set cover_image_url = ${url} where id = ${vid}`;
    }
  }

  // Starter guides, published, with demo covers.
  let art = 0;
  for (const a of starterArticles) {
    const cat = a.category ? await id(sql`select id from mkt.categories where slug = ${a.category}`) : null;
    await sql`
      insert into mkt.articles (slug, title, excerpt, body, section, category_id, cover_url, status, author_name, published_at)
      values (${a.slug}, ${a.title}, ${a.excerpt}, ${a.body}, ${a.section}, ${cat}, ${`/demo/demo-${(art++ % 12) + 1}.jpg`}, 'published',
        'Olready team', now() - ${`${art} days`}::interval)`;
  }

  // Halls and lawns inside the demo venues.
  const spaces = {
    'Rosewood Banquets': [['Crystal Hall', 'indoor', 400, 600], ['Rose Terrace', 'terrace', 80, 150]],
    'Sukhna Greens Lawn': [['Main Lawn', 'outdoor', 900, 1500], ['Pavilion', 'indoor', 150, 250]],
    'Shivalik Courtyard Hotel': [['Grand Ballroom', 'indoor', 220, 300], ['Poolside Deck', 'poolside', 60, 120]],
  };
  for (const [name, list] of Object.entries(spaces)) {
    const [{ id: vid }] = await sql`select id from mkt.vendors where slug = ${slugs[name]}`;
    let n = 0;
    for (const [sname, kind, seating, floating] of list) {
      await sql`insert into mkt.venue_spaces (vendor_id, name, kind, seating, floating, sort) values (${vid}, ${sname}, ${kind}, ${seating}, ${floating}, ${n++})`;
    }
  }

  // A hand-picked list, as the content team would write it.
  const pickVenues = await sql`select id from mkt.vendors where slug in ${sql([slugs['Mango Orchard Farm'], slugs['Sukhna Greens Lawn']])}`;
  await sql`
    insert into mkt.collections (slug, title, intro, category_id, city_id, vendor_ids, status)
    values ('open-air-venues-for-tricity-weddings', 'Open-air venues for Tricity weddings',
      ${'Lawns and farmhouses where the evening is part of the decor. Each one here hosts outdoor functions and lets you plan around the weather with a covered space.'},
      ${await cat('venues')}, ${moh}, ${pickVenues.map((r) => r.id)}, 'published')`;

  // One draft profile Ops built, waiting to be claimed.
  await sql`
    insert into mkt.vendors (category_id, city_id, service_city_ids, slug, business_name, attributes, email, status, claim_status)
    values (${await cat('mehendi-artists')}, ${pkl}, ${[pkl]}, 'henna-house-panchkula-demo', 'Henna House',
      ${sql.json({ organic: true, travels_to_venue: true })}, 'hennahouse@demo.in', 'draft', 'unclaimed')`;

  // A new lead waiting for the verification call, covering three categories.
  const lead = await id(sql`
    insert into mkt.leads (bride_profile_id, bride_name, phone, email, city_id, event_date, source)
    values (${bride}, 'Simran Kaur', '+919876543210', 'simran@demo.in', ${chd}, '2027-02-14', 'website') returning id`);
  for (const [c, budget, cap] of [['bridal-makeup', 25000, 20], ['photographers', 100000, 8], ['mehendi-artists', null, 10]]) {
    await sql`insert into mkt.lead_needs (lead_id, category_id, budget_inr, unlock_cap,
      budget_tier_id) values (${lead}, ${await cat(c)}, ${budget}, ${cap},
      (select id from mkt.budget_tiers where category_id = ${await cat(c)} and ${budget}::int is not null
         and coalesce(min_inr, 0) <= ${budget}::int and (max_inr is null or ${budget}::int < max_inr) limit 1))`;
  }

  // A published real wedding tagging three vendors.
  const rw = await id(sql`
    insert into mkt.real_weddings (slug, title, couple_names, city_id, wedding_date, story, consent_confirmed, submitted_by, status, published_at)
    values ('aanya-and-kabir-winter-wedding-demo', 'A winter wedding in Chandigarh', 'Aanya & Kabir', ${chd}, '2025-12-05',
      'A fictional demo story: three functions over two days, marigold mandap, and a dhol-led baraat.', true, ${bride2}, 'published', now())
    returning id`);
  for (const name of ['Glow by Kirti', 'Marigold Decor Co', 'DJ Baraat Beats']) {
    await sql`insert into mkt.real_wedding_vendors (real_wedding_id, vendor_id, vendor_confirmed)
      select ${rw}, id, true from mkt.vendors where slug = ${slugs[name]}`;
  }

  // Calendars: most vendors keep theirs up to date; a few dates are booked so "free on" filters show something.
  const ist = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  await sql`update mkt.vendors set calendar_updated_at = now() - interval '2 days' where slug = any(${Object.values(slugs)}) and business_name <> 'Lens & Light Studio'`;
  for (const [name, days] of [['Glow by Kirti', [20, 21, 35]], ['Frames & Phere', [21, 50]], ['Rosewood Banquets', [21, 22, 60]], ['Sukhna Greens Lawn', [35]]]) {
    for (const d of days) {
      await sql`insert into mkt.vendor_calendar (vendor_id, day, slot, status, note, source)
        select id, ${ist(d)}::date, 'full', 'booked', 'Demo booking', 'vendor' from mkt.vendors where slug = ${slugs[name]}`;
    }
  }
  await sql`insert into mkt.vendor_calendar (vendor_id, day, slot, status, note, source)
    select id, ${ist(40)}::date, 'full', 'closed', 'Family function', 'vendor' from mkt.vendors where slug = ${slugs['Glow by Kirti']}`;

  await sql`update mkt.gateway_settings set enabled = true where gateway in ('manual', 'test')`;
  await sql`insert into mkt.audit_log (actor_profile_id, action, entity) values (${admin}, 'demo.seed', 'system')`;
  console.log(`Demo data loaded: ${vendors.length} live vendors, 1 unclaimed draft, 1 lead to verify, 1 real wedding`);
} finally {
  await sql.end();
}
