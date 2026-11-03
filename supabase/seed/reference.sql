-- Reference data. Safe for production: no people, no leads.
-- Prices, caps and credit costs are starting defaults; Ops edits them in the console.

insert into mkt.cities (slug, name, state, sort) values
  ('chandigarh', 'Chandigarh', 'Chandigarh', 1),
  ('mohali', 'Mohali', 'Punjab', 2),
  ('panchkula', 'Panchkula', 'Haryana', 3),
  ('ludhiana', 'Ludhiana', 'Punjab', 4),
  ('delhi-ncr', 'Delhi NCR', 'Delhi', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- categories
insert into mkt.categories (slug, name, plural_name, description, wave, sort, active, unlock_credit_cost, unlock_cap, price_unit) values
  ('bridal-makeup', 'Bridal makeup artist', 'Bridal makeup artists', 'Verified bridal and party makeup artists.', 1, 1, true, 1, 20, 'per function'),
  ('photographers', 'Wedding photographer', 'Wedding photographers', 'Candid, traditional and cinematic wedding photography.', 1, 2, true, 2, 8, 'per day'),
  ('decorators', 'Wedding decorator', 'Wedding decorators', 'Decor and floral design for every function.', 1, 3, true, 2, 8, 'per function'),
  ('mehendi-artists', 'Mehendi artist', 'Mehendi artists', 'Bridal and guest mehendi.', 1, 4, true, 1, 10, 'per bride'),
  ('djs-dhol', 'DJ and dhol', 'DJs and dhol players', 'DJs, dhol players and sound for sangeet and baraat.', 1, 5, true, 1, 10, 'per event'),
  ('invitations', 'Invitation designer', 'Invitation designers', 'Printed and digital wedding invitations.', 2, 6, false, 1, 10, 'per 100 cards'),
  ('trousseau-packers', 'Wedding box and trousseau packer', 'Wedding box and trousseau packers', 'Shagun, trousseau and gift packing.', 2, 7, false, 1, 10, 'per box'),
  ('florists', 'Florist', 'Florists', 'Fresh flowers, garlands and floral jewellery.', 2, 8, false, 1, 10, 'per event'),
  ('bartenders', 'Bartender', 'Bartenders', 'Bar service and mixologists.', 2, 9, false, 1, 10, 'per event'),
  ('food-stalls', 'Food stall', 'Food stalls', 'Live counters and chaat stalls.', 2, 10, false, 1, 10, 'per event'),
  ('choreographers', 'Sangeet choreographer', 'Sangeet choreographers', 'Choreography for sangeet performances.', 2, 11, false, 1, 10, 'per song'),
  ('pandits', 'Wedding pandit', 'Wedding pandits', 'Pandits for ceremonies.', 2, 12, false, 1, 10, 'per ceremony'),
  ('bands', 'Wedding band', 'Wedding bands', 'Brass bands and live music.', 2, 13, false, 1, 10, 'per event'),
  ('venues', 'Wedding venue', 'Wedding venues', 'Banquet halls, marriage lawns, hotels, resorts and farmhouses.', 1, 0, true, 3, 6, 'per plate, veg'),
  ('caterers', 'Wedding caterer', 'Wedding caterers', 'Wedding catering, live counters and menus for every function.', 1, 6, true, 2, 6, 'per plate, veg'),
  ('planners', 'Wedding planner', 'Wedding planners', 'Full planning, coordination and destination weddings.', 1, 7, true, 2, 6, 'onwards'),
  ('bridal-wear', 'Bridal wear store', 'Bridal wear stores', 'Bridal lehengas, sarees and groom wear, to buy or rent.', 1, 8, true, 1, 10, 'per outfit'),
  ('jewellery', 'Bridal jeweller', 'Bridal jewellers', 'Bridal jewellery in gold, diamond, kundan and polki, to buy or rent.', 1, 9, true, 1, 10, 'per set')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- fields
-- options: [{"value": "...", "label": "...", "seo": "slug-for-landing-page"}]
insert into mkt.category_fields (category_id, key, label, type, options, required, filterable, on_card, faq_question, seo_slug, sort)
select c.id, f.key, f.label, f.type, f.options::jsonb, f.required, f.filterable, f.on_card, f.faq, f.seo, f.sort
from mkt.categories c
join (values
  ('bridal-makeup','artist_type','Artist type','select','[{"value":"freelance","label":"Freelance artist","seo":"freelance"},{"value":"studio","label":"Makeup studio","seo":"studio"}]',true,true,true,'Is {name} a freelance artist or a studio?',null,1),
  ('bridal-makeup','airbrush','Airbrush makeup','bool','[]',false,true,true,'Does {name} offer airbrush makeup?','airbrush',2),
  ('bridal-makeup','hd','HD makeup','bool','[]',false,true,false,'Does {name} offer HD makeup?','hd',3),
  ('bridal-makeup','travels_to_venue','Travels to venue','bool','[]',true,true,true,'Does {name} travel to the venue?','travels-to-venue',4),
  ('bridal-makeup','trial_policy','Trial policy','select','[{"value":"free","label":"Free trial"},{"value":"paid","label":"Paid trial"},{"value":"paid_adjusted","label":"Paid trial, adjusted if booked"},{"value":"none","label":"No trial"}]',true,false,true,'What is {name}''s trial policy?',null,5),
  ('bridal-makeup','products','Products used','text','[]',false,false,false,'Which products does {name} use?',null,6),
  ('photographers','styles','Styles','multiselect','[{"value":"candid","label":"Candid","seo":"candid"},{"value":"traditional","label":"Traditional","seo":"traditional"},{"value":"cinematic","label":"Cinematic films","seo":"cinematic"},{"value":"pre_wedding","label":"Pre-wedding shoots","seo":"pre-wedding"}]',true,true,true,'What photography styles does {name} offer?',null,1),
  ('photographers','team_size','Team size','number','[]',false,false,false,'How big is {name}''s team?',null,2),
  ('photographers','delivery_weeks','Delivery time (weeks)','number','[]',false,false,true,'How long does {name} take to deliver photos?',null,3),
  ('photographers','drone','Drone coverage','bool','[]',false,true,false,'Does {name} offer drone coverage?','drone',4),
  ('decorators','decor_type','Decor scale','select','[{"value":"budget","label":"Budget","seo":"budget"},{"value":"mid","label":"Mid range","seo":"mid-range"},{"value":"luxury","label":"Luxury","seo":"luxury"}]',true,true,true,'What price range does {name} work in?',null,1),
  ('decorators','floral','Floral decor in-house','bool','[]',false,true,true,'Does {name} do floral decor in-house?','floral',2),
  ('decorators','functions','Functions covered','multiselect','[{"value":"mehendi","label":"Mehendi"},{"value":"sangeet","label":"Sangeet"},{"value":"wedding","label":"Wedding"},{"value":"reception","label":"Reception"}]',false,false,false,'Which functions does {name} decorate?',null,3),
  ('mehendi-artists','organic','Organic mehendi','bool','[]',false,true,true,'Does {name} use organic mehendi?','organic',1),
  ('mehendi-artists','team_size','Artists in team','number','[]',false,false,true,'How many artists does {name} bring?',null,2),
  ('mehendi-artists','travels_to_venue','Travels to venue','bool','[]',true,true,true,'Does {name} travel to the venue?','travels-to-venue',3),
  ('djs-dhol','services','Services','multiselect','[{"value":"dj","label":"DJ","seo":"dj"},{"value":"dhol","label":"Dhol","seo":"dhol"},{"value":"sound","label":"Sound and lights","seo":"sound"}]',true,true,true,'What does {name} provide?',null,1),
  ('djs-dhol','hours_included','Hours included','number','[]',false,false,true,'How many hours are included?',null,2),
  ('venues','venue_type','Venue type','select','[{"value":"banquet","label":"Banquet hall","seo":"banquet-halls"},{"value":"lawn","label":"Marriage lawn","seo":"marriage-lawns"},{"value":"hotel","label":"Hotel","seo":"hotels"},{"value":"resort","label":"Resort","seo":"resorts"},{"value":"farmhouse","label":"Farmhouse","seo":"farmhouses"},{"value":"club","label":"Club","seo":"clubs"}]',true,true,true,'What kind of venue is {name}?',null,1),
  ('venues','capacity_max','Maximum guests','number','[{"value":"small","label":"Under 200 guests","seo":"under-200-guests","max":199},{"value":"200","label":"200+ guests","seo":"200-guests","min":200},{"value":"500","label":"500+ guests","seo":"500-guests","min":500},{"value":"1000","label":"1,000+ guests","seo":"1000-guests","min":1000}]',true,true,true,'How many guests can {name} host?',null,2),
  ('venues','non_veg_per_plate','Non-veg per plate','money','[]',false,false,true,'What does a non-veg plate cost at {name}?',null,3),
  ('venues','rooms','Rooms','number','[]',false,false,false,'How many rooms does {name} have?',null,4),
  ('venues','setting','Setting','multiselect','[{"value":"indoor","label":"Indoor"},{"value":"outdoor","label":"Outdoor","seo":"outdoor"},{"value":"poolside","label":"Poolside","seo":"poolside"}]',false,true,false,'Is {name} indoor or outdoor?',null,5),
  ('venues','alcohol_allowed','Alcohol allowed','bool','[]',false,true,false,'Can we serve alcohol at {name}?','alcohol-allowed',6),
  ('venues','outside_catering','Outside caterers allowed','bool','[]',false,true,false,'Can we bring our own caterer to {name}?','outside-catering',7),
  ('venues','outside_decor','Outside decorators allowed','bool','[]',false,false,false,'Can we bring our own decorator to {name}?',null,8),
  ('caterers','food_type','Food','select','[{"value":"veg","label":"Pure veg","seo":"pure-veg"},{"value":"veg_nonveg","label":"Veg and non-veg","seo":"non-veg"}]',true,true,true,'Does {name} serve non-veg?',null,1),
  ('caterers','cuisines','Cuisines','multiselect','[{"value":"punjabi","label":"Punjabi","seo":"punjabi"},{"value":"north_indian","label":"North Indian"},{"value":"south_indian","label":"South Indian","seo":"south-indian"},{"value":"chinese","label":"Chinese"},{"value":"continental","label":"Continental"},{"value":"live_counters","label":"Live counters","seo":"live-counters"}]',true,true,false,'Which cuisines does {name} cook?',null,2),
  ('caterers','min_guests','Minimum guests','number','[]',false,false,true,'What is the smallest event {name} caters?',null,3),
  ('caterers','non_veg_per_plate','Non-veg per plate','money','[]',false,false,false,'What does a non-veg plate cost with {name}?',null,4),
  ('planners','services','Services','multiselect','[{"value":"full","label":"Full planning","seo":"full-planning"},{"value":"coordination","label":"Day-of coordination","seo":"coordination"},{"value":"destination","label":"Destination weddings","seo":"destination"},{"value":"design","label":"Decor design"}]',true,true,true,'What does {name} handle?',null,1),
  ('planners','weddings_done','Weddings planned','number','[]',false,false,true,'How many weddings has {name} planned?',null,2),
  ('planners','fee_model','Fee','select','[{"value":"percent","label":"Percentage of budget"},{"value":"fixed","label":"Fixed fee"}]',false,false,false,'How does {name} charge?',null,3),
  ('bridal-wear','wear_type','Outfits','multiselect','[{"value":"lehenga","label":"Lehengas","seo":"lehengas"},{"value":"saree","label":"Sarees","seo":"sarees"},{"value":"sharara","label":"Shararas"},{"value":"gown","label":"Gowns"},{"value":"sherwani","label":"Sherwanis","seo":"sherwanis"}]',true,true,true,'What outfits does {name} offer?',null,1),
  ('bridal-wear','rental','On rent','bool','[]',false,true,true,'Does {name} rent outfits?','on-rent',2),
  ('bridal-wear','custom_made','Made to order','bool','[]',false,true,false,'Does {name} make outfits to order?','made-to-order',3),
  ('jewellery','jewellery_type','Jewellery','multiselect','[{"value":"gold","label":"Gold","seo":"gold"},{"value":"diamond","label":"Diamond","seo":"diamond"},{"value":"kundan","label":"Kundan and polki","seo":"kundan-polki"},{"value":"silver","label":"Silver"},{"value":"artificial","label":"Artificial","seo":"artificial"}]',true,true,true,'What jewellery does {name} make?',null,1),
  ('jewellery','rental','On rent','bool','[]',false,true,true,'Does {name} rent jewellery?','on-rent',2),
  ('jewellery','certified','Hallmarked or certified','bool','[]',false,false,true,'Is {name}''s jewellery hallmarked or certified?',null,3)
) as f(cat, key, label, type, options, required, filterable, on_card, faq, seo, sort)
  on f.cat = c.slug
on conflict (category_id, key) do nothing;

-- ---------------------------------------------------------------- budget tiers
insert into mkt.budget_tiers (category_id, code, label, min_inr, max_inr, sort)
select c.id, t.code, t.label, t.min_inr, t.max_inr, t.sort
from mkt.categories c
join (values
  ('bridal-makeup','value','Under ₹15,000',0,15000,1),
  ('bridal-makeup','premium','₹15,000–₹40,000',15000,40000,2),
  ('bridal-makeup','luxe','Above ₹40,000',40000,null,3),
  ('photographers','value','Under ₹75,000',0,75000,1),
  ('photographers','premium','₹75,000–₹2,00,000',75000,200000,2),
  ('photographers','luxe','Above ₹2,00,000',200000,null,3),
  ('decorators','value','Under ₹1,00,000',0,100000,1),
  ('decorators','premium','₹1,00,000–₹5,00,000',100000,500000,2),
  ('decorators','luxe','Above ₹5,00,000',500000,null,3),
  ('mehendi-artists','value','Under ₹10,000',0,10000,1),
  ('mehendi-artists','premium','Above ₹10,000',10000,null,2),
  ('djs-dhol','value','Under ₹30,000',0,30000,1),
  ('djs-dhol','premium','Above ₹30,000',30000,null,2),
  ('venues','value','Under ₹5,00,000',0,500000,1),
  ('venues','premium','₹5,00,000–₹15,00,000',500000,1500000,2),
  ('venues','luxe','Above ₹15,00,000',1500000,null,3),
  ('caterers','value','Under ₹3,00,000',0,300000,1),
  ('caterers','premium','Above ₹3,00,000',300000,null,2),
  ('planners','value','Under ₹2,00,000',0,200000,1),
  ('planners','premium','Above ₹2,00,000',200000,null,2),
  ('bridal-wear','value','Under ₹75,000',0,75000,1),
  ('bridal-wear','premium','Above ₹75,000',75000,null,2),
  ('jewellery','value','Under ₹2,00,000',0,200000,1),
  ('jewellery','premium','Above ₹2,00,000',200000,null,2)
) as t(cat, code, label, min_inr, max_inr, sort)
  on t.cat = c.slug
on conflict (category_id, code) do nothing;

-- ---------------------------------------------------------------- packs
-- Plans use the current mua.olready.in prices (GST included). Plans activate only
-- after Ops uploads the invoice and signed contract; top-ups activate on payment.
insert into mkt.packs (code, name, kind, credits, price_inr, validity_days, category_ids, requires_contract, sort, description) values
  ('pro', 'Pro', 'plan', 60, 18999, 90, null, true, 1, '60 verified enquiries over 3 months.'),
  ('phoenix', 'Phoenix', 'plan', 100, 35000, 180, null, true, 2, '100 verified enquiries over 6 months, with a relationship manager.'),
  ('privy', 'Privy', 'plan', 120, 50000, 180, null, true, 3, 'Invite only. 120 verified enquiries over 6 months, with dedicated support.'),
  ('topup-10', 'Top-up 10', 'topup', 10, 4999, null, null, false, 4, '10 credits, no contract needed.'),
  ('topup-25', 'Top-up 25', 'topup', 25, 10000, null, null, false, 5, '25 credits, no contract needed.'),
  ('starter-5', 'Starter 5', 'topup', 5, 2500, null, null, false, 6, '5 credits to try OLReady in a new category.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- checklist templates
insert into mkt.checklist_templates (title, months_before, category_id, sort)
select t.title, t.months_before, c.id, t.sort
from (values
  ('Fix the wedding date and budget', 10, null, 1),
  ('Book the venue', 9, null, 2),
  ('Shortlist and book a photographer', 8, 'photographers', 3),
  ('Book the decorator', 7, 'decorators', 4),
  ('Book a makeup trial and the bridal makeup artist', 6, 'bridal-makeup', 5),
  ('Finalise the guest list', 5, null, 6),
  ('Send invitations', 3, 'invitations', 7),
  ('Book the mehendi artist', 3, 'mehendi-artists', 8),
  ('Book the DJ and dhol', 3, 'djs-dhol', 9),
  ('Confirm RSVPs and headcount', 1, null, 10),
  ('Share the day plan with every vendor', 0, null, 11)
) as t(title, months_before, cat, sort)
left join mkt.categories c on c.slug = t.cat
where not exists (select 1 from mkt.checklist_templates);

insert into mkt.invite_templates (code, name, theme, price_inr) values
  ('ivory-gold', 'Ivory and gold', '{"bg":"#FBF7EF","ink":"#1A1A1A","accent":"#C48000","font":"serif"}', 0),
  ('midnight', 'Midnight', '{"bg":"#111111","ink":"#F5F1E8","accent":"#D9A43B","font":"serif"}', 0),
  ('marigold', 'Marigold', '{"bg":"#FFF4E0","ink":"#3A1F00","accent":"#E0791B","font":"sans"}', 0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- idea topics and tags
insert into mkt.idea_topics (slug, name, description, category_id, sort)
select t.slug, t.name, t.description, c.id, t.sort
from (values
  ('bridal-makeup-looks', 'Bridal makeup looks', 'Bridal and party makeup by Tricity artists.', 'bridal-makeup', 1),
  ('mehendi-designs', 'Mehendi designs', 'Bridal and guest mehendi designs.', 'mehendi-artists', 2),
  ('wedding-decor', 'Wedding decor', 'Mandaps, stages, entrances and table decor.', 'decorators', 3),
  ('wedding-venues', 'Wedding venues', 'Banquets, lawns, hotels and farmhouses, set up for weddings.', 'venues', 4),
  ('wedding-photography', 'Wedding photography', 'Candid moments, portraits and pre-wedding shoots.', 'photographers', 5),
  ('bridal-lehengas', 'Bridal outfits', 'Lehengas, sarees, shararas and sherwanis.', 'bridal-wear', 6),
  ('bridal-jewellery', 'Bridal jewellery', 'Kundan, polki, gold and diamond bridal sets.', 'jewellery', 7),
  ('wedding-food', 'Wedding food', 'Menus, live counters and food styling.', 'caterers', 8),
  ('wedding-entertainment', 'Music and baraat', 'DJs, dhol and baraat moments.', 'djs-dhol', 9),
  ('real-wedding-moments', 'Real wedding moments', 'Photos from real Tricity weddings.', null, 10)
) as t(slug, name, description, cat, sort)
left join mkt.categories c on c.slug = t.cat
on conflict (slug) do nothing;

insert into mkt.idea_tags (topic_id, slug, label, sort)
select tp.id, t.slug, t.label, t.sort
from (values
  ('bridal-makeup-looks','subtle','Subtle',1), ('bridal-makeup-looks','glam','Glam',2), ('bridal-makeup-looks','airbrush','Airbrush',3), ('bridal-makeup-looks','smokey-eyes','Smokey eyes',4), ('bridal-makeup-looks','hairstyles','Hairstyles',5),
  ('mehendi-designs','arabic','Arabic',1), ('mehendi-designs','traditional','Traditional',2), ('mehendi-designs','minimal','Minimal',3), ('mehendi-designs','portrait','Portrait',4), ('mehendi-designs','feet','Feet',5),
  ('wedding-decor','mandap','Mandap',1), ('wedding-decor','stage','Stage',2), ('wedding-decor','floral','Floral',3), ('wedding-decor','haldi','Haldi',4), ('wedding-decor','mehendi','Mehendi',5), ('wedding-decor','lights','Lights',6), ('wedding-decor','entrance','Entrance',7),
  ('wedding-venues','lawn','Lawns',1), ('wedding-venues','banquet','Banquets',2), ('wedding-venues','poolside','Poolside',3), ('wedding-venues','night','Night',4),
  ('wedding-photography','candid','Candid',1), ('wedding-photography','couple-portraits','Couple portraits',2), ('wedding-photography','pre-wedding','Pre-wedding',3), ('wedding-photography','family','Family',4),
  ('bridal-lehengas','red','Red',1), ('bridal-lehengas','pastel','Pastel',2), ('bridal-lehengas','pink','Pink',3), ('bridal-lehengas','gold','Gold',4), ('bridal-lehengas','groom','Groom',5),
  ('bridal-jewellery','kundan','Kundan',1), ('bridal-jewellery','polki','Polki',2), ('bridal-jewellery','choker','Choker',3), ('bridal-jewellery','nath','Nath',4), ('bridal-jewellery','maang-tikka','Maang tikka',5),
  ('wedding-food','live-counters','Live counters',1), ('wedding-food','desserts','Desserts',2), ('wedding-food','chaat','Chaat',3),
  ('wedding-entertainment','baraat','Baraat',1), ('wedding-entertainment','sangeet','Sangeet',2), ('wedding-entertainment','dhol','Dhol',3),
  ('real-wedding-moments','pheras','Pheras',1), ('real-wedding-moments','varmala','Varmala',2), ('real-wedding-moments','vidaai','Vidaai',3), ('real-wedding-moments','candid','Candid',4)
) as t(topic, slug, label, sort)
join mkt.idea_topics tp on tp.slug = t.topic
on conflict (topic_id, slug) do nothing;

-- ---------------------------------------------------------------- e-invite designs (original; layout x palette)
insert into mkt.invite_templates (code, name, theme, price_inr, kind, layout, culture, themes, sort) values
  ('classic-ivory-gold', 'Classic, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'card', 'classic', 'generic', '{traditional,elegant}', 10),
  ('classic-maroon-gold', 'Classic, maroon and gold', '{"bg":"#5B0F1B","ink":"#FBEBD0","accent":"#E5B567","font":"serif"}', 0, 'card', 'classic', 'hindu', '{traditional,elegant}', 11),
  ('classic-silver', 'Classic, white and silver', '{"bg":"#FFFFFF","ink":"#222222","accent":"#8A94A0","font":"serif"}', 0, 'card', 'classic', 'christian', '{traditional,elegant}', 12),
  ('classic-rose', 'Classic, rose', '{"bg":"#FDEFF2","ink":"#4A1F2B","accent":"#C2185B","font":"serif"}', 0, 'card', 'classic', 'generic', '{traditional,elegant}', 13),
  ('classic-midnight', 'Classic, midnight', '{"bg":"#13132B","ink":"#F2EBDD","accent":"#C9A45C","font":"serif"}', 0, 'card', 'classic', 'muslim', '{traditional,elegant}', 14),
  ('classic-saffron', 'Classic, saffron', '{"bg":"#FFF3E0","ink":"#3E2106","accent":"#E65100","font":"serif"}', 0, 'card', 'classic', 'hindu', '{traditional,elegant}', 15),
  ('arch-maroon-gold', 'Arch, maroon and gold', '{"bg":"#5B0F1B","ink":"#FBEBD0","accent":"#E5B567","font":"serif"}', 0, 'card', 'arch', 'hindu', '{royal,traditional}', 16),
  ('arch-emerald', 'Arch, emerald', '{"bg":"#0F3D2E","ink":"#F3EBD3","accent":"#D4AF37","font":"serif"}', 0, 'card', 'arch', 'muslim', '{royal,traditional}', 17),
  ('arch-peacock', 'Arch, peacock', '{"bg":"#0E4A52","ink":"#F5EFE2","accent":"#E0B04A","font":"serif"}', 0, 'card', 'arch', 'muslim', '{royal,traditional}', 18),
  ('arch-ivory-gold', 'Arch, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'card', 'arch', 'sikh', '{royal,traditional}', 19),
  ('arch-midnight', 'Arch, midnight', '{"bg":"#13132B","ink":"#F2EBDD","accent":"#C9A45C","font":"serif"}', 0, 'card', 'arch', 'generic', '{royal,traditional}', 20),
  ('arch-mustard', 'Arch, mustard', '{"bg":"#FFF8DC","ink":"#3B2F0B","accent":"#C49102","font":"serif"}', 0, 'card', 'arch', 'hindu', '{royal,traditional}', 21),
  ('floral-rose', 'Floral, rose', '{"bg":"#FDEFF2","ink":"#4A1F2B","accent":"#C2185B","font":"serif"}', 0, 'card', 'floral', 'generic', '{floral,elegant}', 22),
  ('floral-sage', 'Floral, blush and sage', '{"bg":"#F5F1EB","ink":"#2F3A2F","accent":"#7C9A7A","font":"serif"}', 0, 'card', 'floral', 'christian', '{floral,elegant}', 23),
  ('floral-lavender', 'Floral, lavender', '{"bg":"#F3EEFA","ink":"#2E2340","accent":"#7E57C2","font":"serif"}', 0, 'card', 'floral', 'generic', '{floral,elegant}', 24),
  ('floral-ivory-gold', 'Floral, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'card', 'floral', 'punjabi', '{floral,elegant}', 25),
  ('floral-mustard', 'Floral, mustard', '{"bg":"#FFF8DC","ink":"#3B2F0B","accent":"#C49102","font":"serif"}', 0, 'card', 'floral', 'south-indian', '{floral,elegant}', 26),
  ('floral-rosegold', 'Floral, black and rose gold', '{"bg":"#161214","ink":"#F7E7E1","accent":"#D4A59A","font":"serif"}', 0, 'card', 'floral', 'generic', '{floral,elegant}', 27),
  ('mandala-saffron', 'Mandala, saffron', '{"bg":"#FFF3E0","ink":"#3E2106","accent":"#E65100","font":"serif"}', 0, 'card', 'mandala', 'hindu', '{traditional,royal}', 28),
  ('mandala-maroon-gold', 'Mandala, maroon and gold', '{"bg":"#5B0F1B","ink":"#FBEBD0","accent":"#E5B567","font":"serif"}', 0, 'card', 'mandala', 'hindu', '{traditional,royal}', 29),
  ('mandala-peacock', 'Mandala, peacock', '{"bg":"#0E4A52","ink":"#F5EFE2","accent":"#E0B04A","font":"serif"}', 0, 'card', 'mandala', 'south-indian', '{traditional,royal}', 30),
  ('mandala-mustard', 'Mandala, mustard', '{"bg":"#FFF8DC","ink":"#3B2F0B","accent":"#C49102","font":"serif"}', 0, 'card', 'mandala', 'marathi', '{traditional,royal}', 31),
  ('mandala-emerald', 'Mandala, emerald', '{"bg":"#0F3D2E","ink":"#F3EBD3","accent":"#D4AF37","font":"serif"}', 0, 'card', 'mandala', 'bengali', '{traditional,royal}', 32),
  ('mandala-ivory-gold', 'Mandala, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'card', 'mandala', 'sikh', '{traditional,royal}', 33),
  ('modern-silver', 'Modern, white and silver', '{"bg":"#FFFFFF","ink":"#222222","accent":"#8A94A0","font":"sans"}', 0, 'card', 'modern', 'generic', '{minimal,modern}', 34),
  ('modern-rosegold', 'Modern, black and rose gold', '{"bg":"#161214","ink":"#F7E7E1","accent":"#D4A59A","font":"sans"}', 0, 'card', 'modern', 'generic', '{minimal,modern}', 35),
  ('modern-sage', 'Modern, blush and sage', '{"bg":"#F5F1EB","ink":"#2F3A2F","accent":"#7C9A7A","font":"sans"}', 0, 'card', 'modern', 'christian', '{minimal,modern}', 36),
  ('modern-midnight', 'Modern, midnight', '{"bg":"#13132B","ink":"#F2EBDD","accent":"#C9A45C","font":"sans"}', 0, 'card', 'modern', 'generic', '{minimal,modern}', 37),
  ('modern-lavender', 'Modern, lavender', '{"bg":"#F3EEFA","ink":"#2E2340","accent":"#7E57C2","font":"sans"}', 0, 'card', 'modern', 'generic', '{minimal,modern}', 38),
  ('modern-rose', 'Modern, rose', '{"bg":"#FDEFF2","ink":"#4A1F2B","accent":"#C2185B","font":"sans"}', 0, 'card', 'modern', 'punjabi', '{minimal,modern}', 39),
  ('royal-maroon-gold', 'Royal, maroon and gold', '{"bg":"#5B0F1B","ink":"#FBEBD0","accent":"#E5B567","font":"serif"}', 0, 'card', 'royal', 'punjabi', '{royal,luxury}', 40),
  ('royal-emerald', 'Royal, emerald', '{"bg":"#0F3D2E","ink":"#F3EBD3","accent":"#D4AF37","font":"serif"}', 0, 'card', 'royal', 'sikh', '{royal,luxury}', 41),
  ('royal-midnight', 'Royal, midnight', '{"bg":"#13132B","ink":"#F2EBDD","accent":"#C9A45C","font":"serif"}', 0, 'card', 'royal', 'muslim', '{royal,luxury}', 42),
  ('royal-peacock', 'Royal, peacock', '{"bg":"#0E4A52","ink":"#F5EFE2","accent":"#E0B04A","font":"serif"}', 0, 'card', 'royal', 'hindu', '{royal,luxury}', 43),
  ('royal-rosegold', 'Royal, black and rose gold', '{"bg":"#161214","ink":"#F7E7E1","accent":"#D4A59A","font":"serif"}', 0, 'card', 'royal', 'generic', '{royal,luxury}', 44),
  ('royal-ivory-gold', 'Royal, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'card', 'royal', 'bengali', '{royal,luxury}', 45),
  ('std-modern-silver', 'Save the date, white and silver', '{"bg":"#FFFFFF","ink":"#222222","accent":"#8A94A0","font":"sans"}', 0, 'save_the_date', 'modern', 'generic', '{save-the-date,modern}', 46),
  ('std-modern-rosegold', 'Save the date, black and rose gold', '{"bg":"#161214","ink":"#F7E7E1","accent":"#D4A59A","font":"sans"}', 0, 'save_the_date', 'modern', 'generic', '{save-the-date,modern}', 47),
  ('std-modern-sage', 'Save the date, blush and sage', '{"bg":"#F5F1EB","ink":"#2F3A2F","accent":"#7C9A7A","font":"sans"}', 0, 'save_the_date', 'modern', 'generic', '{save-the-date,modern}', 48),
  ('std-floral-rose', 'Save the date, rose', '{"bg":"#FDEFF2","ink":"#4A1F2B","accent":"#C2185B","font":"serif"}', 0, 'save_the_date', 'floral', 'generic', '{save-the-date,modern}', 49),
  ('std-floral-lavender', 'Save the date, lavender', '{"bg":"#F3EEFA","ink":"#2E2340","accent":"#7E57C2","font":"serif"}', 0, 'save_the_date', 'floral', 'generic', '{save-the-date,modern}', 50),
  ('std-classic-ivory-gold', 'Save the date, ivory and gold', '{"bg":"#FBF7EF","ink":"#2A1D12","accent":"#B8860B","font":"serif"}', 0, 'save_the_date', 'classic', 'generic', '{save-the-date,modern}', 51),
  ('std-modern-midnight', 'Save the date, midnight', '{"bg":"#13132B","ink":"#F2EBDD","accent":"#C9A45C","font":"sans"}', 0, 'save_the_date', 'modern', 'generic', '{save-the-date,modern}', 52),
  ('std-floral-mustard', 'Save the date, mustard', '{"bg":"#FFF8DC","ink":"#3B2F0B","accent":"#C49102","font":"serif"}', 0, 'save_the_date', 'floral', 'generic', '{save-the-date,modern}', 53)
on conflict (code) do update set name = excluded.name, theme = excluded.theme, kind = excluded.kind, layout = excluded.layout,
  culture = excluded.culture, themes = excluded.themes, sort = excluded.sort;
-- The three first designs stay as classic layouts.
update mkt.invite_templates set layout = 'classic', culture = 'generic', themes = '{traditional,elegant}', sort = 1 where code in ('ivory-gold','midnight','marigold');
