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
  ('bands', 'Wedding band', 'Wedding bands', 'Brass bands and live music.', 2, 13, false, 1, 10, 'per event')
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
  ('djs-dhol','hours_included','Hours included','number','[]',false,false,true,'How many hours are included?',null,2)
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
  ('djs-dhol','premium','Above ₹30,000',30000,null,2)
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
