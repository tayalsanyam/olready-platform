// OLREADY platform policies, version 4.0. Adapted from the sales-site policies v3.1
// (olreadysaleswebsite/lib/legal-v31.ts, synced from Legal Docs/*.docx) for the marketplace:
// brides and families, every vendor category, verified enquiries, chats, planning tools and AI.
// Wording kept from v3.1 wherever it still applies. Have counsel review before publishing a new
// version; bump LEGAL_VERSION and LEGAL_EFFECTIVE together.

export const LEGAL_VERSION = '4.0';
export const LEGAL_EFFECTIVE = process.env.LEGAL_EFFECTIVE ?? '1 December 2026';

export const OPERATOR = {
  name: 'Kanika Khanna, sole proprietor trading as Katalyst Infomedia, operating the OLREADY brand',
  address: '2nd Floor, SCO 198–199, Next 57 Coworking, Sector 17C, Chandigarh, Chandigarh 160017, India',
  gstin: '04DJVPK1491Q1ZC',
  email: 'care@olready.in',
  phone: '+91 86998 89901',
  whatsapp: '918699889901',
  hours: 'Monday to Saturday, 10:00 am to 6:30 pm IST',
  grievance: { name: 'Sanyam Tayal', role: 'IT & Grievance Officer', email: 'Tayalsanyam@gmail.com', phone: '+91-7009191914' },
};

export type Section = { id: string; heading: string; body: string[] };
export type Policy = { slug: 'terms' | 'privacy' | 'refunds'; title: string; summary: string; sections: Section[] };

const contact = [
  `Email: ${OPERATOR.email}. Phone and WhatsApp: ${OPERATOR.phone}. Office hours: ${OPERATOR.hours}.`,
  `Grievance Officer: ${OPERATOR.grievance.name}, ${OPERATOR.grievance.role}. Email: ${OPERATOR.grievance.email}. Phone: ${OPERATOR.grievance.phone}. Postal address: ${OPERATOR.address}.`,
  'Formal grievances are acknowledged within 48 hours. We aim to address them within seven working days, subject to any applicable statutory resolution period.',
];

const continuity = [
  'OLREADY was previously managed by KSM Beauty Pvt Ltd, with its registered office at SCF 342, Motor Market, Manimajra, Chandigarh 160101. Katalyst Infomedia has taken over the OLREADY brand, client relationships, copyrights, assets, running plans and outstanding deliverables from KSM Beauty Pvt Ltd.',
  'Transferred running plans continue on their applicable agreed terms. The change of operator does not restart validity, create a fresh refund window or renew exhausted entitlements. Enquiries bought on the earlier OLREADY site stay with that site and are not copied into this platform.',
];

export const TERMS: Policy = {
  slug: 'terms',
  title: 'Terms of Use',
  summary: 'The rules for brides, families and vendors using OLREADY: accounts, enquiries, chats, reviews, plans and promotion.',
  sections: [
    {
      id: 'scope',
      heading: 'Who we are and what these terms cover',
      body: [
        `These Terms of Use govern access to and use of the OLREADY website at olready.in, user accounts, content and related online services, including the wedding vendor marketplace, planning tools and vendor dashboard. The operator is ${OPERATOR.name} ("OLREADY", "we", "us" or "our"). Business address: ${OPERATOR.address}. GSTIN: ${OPERATOR.gstin}.`,
        '"You" means the person using the website and, where applicable, the business that person is authorised to represent. A "bride" includes a person planning a wedding and family members she adds to her wedding. A "vendor" is a business listed on OLREADY, such as a venue, caterer, makeup artist, photographer, decorator, mehendi artist, DJ, planner, bridal wear store or jeweller.',
        'You must be at least 18 and legally capable of contracting to create an account, send an enquiry or make a purchase. By creating an account, sending an enquiry or making a purchase you agree to these terms, the Privacy Policy and, for purchases, the Refund and Cancellation Policy. Separate optional marketing or WhatsApp consent is not a condition of accepting these terms.',
      ],
    },
    { id: 'continuity', heading: 'Business continuity', body: continuity },
    {
      id: 'accounts',
      heading: 'Accounts and sign-in',
      body: [
        'There is no password. You sign in with a one-time code sent to your email; the first sign-in with an email creates its account. Keep access to that email secure. Staff accounts must also use an authenticator code where OLREADY requires it.',
        'Give accurate details and keep your email and phone current; we send service messages there. You are responsible for activity under your account, except where it results from OLREADY’s own breach. Tell us promptly at care@olready.in if you suspect someone else has used it.',
        'A business account must use an email that is not also used for a bride’s wedding. Do not create duplicate accounts to obtain offers, rewards or extra enquiries.',
      ],
    },
    {
      id: 'enquiries',
      heading: 'Enquiries and verification',
      body: [
        'A bride may send one request for several vendor categories, with her date, functions, guest count, city and budget. OLREADY calls to confirm the request before vendors can see it. Verification means we have carried out these checks with the information available at the time. It is not a guarantee of a person’s continuing intentions, budget, payment capacity or future conduct.',
        'Verified requests are shown to live vendors in the matching category and city. Unless the request was made to one vendor only, each request is non-exclusive and is open to a limited number of vendors, shown on the lead. When that number is reached the request closes; OLREADY may reopen it for further vendors.',
        'An enquiry is a chance to connect, not a booking, appointment or advance payment. A bride is free to compare quotes, decline, or book outside OLREADY. Requests whose details prove false or wrong may be removed, and vendors who unlocked them have their credits returned.',
      ],
    },
    {
      id: 'unlocks',
      heading: 'Unlocks, conversations and quotes',
      body: [
        'A vendor unlocks a verified request using credits. An unlock is recorded when the request’s contact details and conversation become available to the vendor’s account; a reply or booking is not required for it to count. Plan credits follow the plan; top-up credits never expire.',
        'Conversations and quotes take place on OLREADY first. Messages may be checked automatically for signs of fraud, requests to pay outside the platform, card numbers and abuse, and may be reviewed by OLREADY staff for safety, quality and disputes. Either side may report a message.',
        'Quotes are the vendor’s own offer. OLREADY may summarise a quote to help a bride compare (for example, what is included and what costs extra); that summary is a reading aid and the vendor’s own words prevail. A booking is a contract between the bride and the vendor. OLREADY is not a party to it and does not collect, hold or insure vendor fees unless expressly agreed in writing.',
      ],
    },
    {
      id: 'vendors',
      heading: 'Vendor obligations',
      body: [
        'Vendors must provide accurate profile, price, capacity and availability information, hold the permissions and competence their services need, respond reasonably and honour bookings they accept. Vendors are responsible for their quotations, service quality, staff, products, safety practices, travel, client charges, taxes and their own cancellation or refund terms.',
        'Use enquiry information solely to respond to that request and administer any resulting booking. Do not resell, publish, scrape or add it to unrelated campaigns, or upload it to unrelated AI or marketing systems. Restrict access to authorised personnel, respect opt-outs and protect client information.',
        'Fabricated complaints or bookings, altered screenshots, impersonation, coupon manipulation, scraping, interference with security, harassment, threats and disclosure of private client information are prohibited. This does not restrict lawful complaints or honest reviews.',
      ],
    },
    {
      id: 'reviews',
      heading: 'Reviews, real weddings and submitted content',
      body: [
        'Brides may review vendors they had a conversation with on OLREADY, or that invited them to review. Reviews must be honest and about first-hand experience. A review is marked "Booked via OLREADY" when the booking was reported through the platform. Vendors may reply publicly and may dispute a review they believe is false; OLREADY contacts the vendor, considers evidence and decides, and may hide reviews that breach these terms.',
        'Real wedding stories, photos and vendor tags are published only after the couple confirms they have the rights and permissions for them and OLREADY approves them. Tagged vendors may confirm their part.',
        'You keep ownership of material you submit, including photos, videos, logos, invitations and testimonials, and warrant you have the rights to it. You grant OLREADY a non-exclusive, royalty-free licence to host, reproduce, format and display it for the purposes you use it for on OLREADY, including public profile, listing, ideas and real-wedding pages, and through service providers needed for those purposes. Public pages may be indexed and cached by search engines. We may remove material that is unlawful, misleading, infringes rights or breaches these terms.',
      ],
    },
    {
      id: 'tools',
      heading: 'Planning tools, invitations and guest lists',
      body: [
        'The wedding workspace, checklist, budget, shortlist, wedding wall, e-invites, guest list and RSVP links are provided for personal planning. Family members you add can see and edit what the workspace lets them. If you add guests’ names and phone numbers, you confirm you may share them with us for sending invitations and collecting replies.',
        'E-invite pages and RSVP links are reachable by anyone who has the link. Share them with care. Ask OLREADY, our planning helper, answers from OLREADY’s listings and your own plan; its suggestions can be wrong, so check details with the vendor before you book. It changes your plan only when you confirm.',
      ],
    },
    {
      id: 'plans',
      heading: 'Vendor plans, credits and promotion',
      body: [
        'Prices are in Indian rupees and include 18% GST. OLREADY issues a GST tax invoice with each payment; Chandigarh is the supplier’s location and the invoice records the place of supply. Razorpay, PayU or bank transfer process payments where enabled. Published coupon conditions govern eligibility, validity and limits; an accepted genuine order keeps its recorded price.',
        'Plans activate once the signed service agreement is recorded; payment, invoice and onboarding are separate steps and are not activation. Validity starts on activation and ordinary unused entitlements lapse at expiry. Top-up credits are added when payment is confirmed. Renewals are separate purchases; no recurring debit is authorised merely by purchasing a plan. Invitation-only plans are governed by their separate signed agreements.',
        'Promotion is paid from a prepaid ads wallet. A Boost is charged a set price per profile visit, at most once per visitor per day and within its daily budget. Banners are booked by month and placement and need OLREADY’s approval. Promoted placements are always labelled Sponsored and do not change a vendor’s position in regular results or in Ask OLREADY’s suggestions.',
        'OLREADY supplies enquiry access and the features in your plan. It does not guarantee bookings, minimum revenue, profit or a conversion rate. No employee, relationship manager or automated assistant may promise guaranteed bookings, unlimited leads, refunds or extensions outside the applicable agreement.',
      ],
    },
    {
      id: 'rm',
      heading: 'Relationship-manager help for brides',
      body: [
        'A bride may buy relationship-manager help or receive it as a booking reward. OLREADY approves the request and assigns a relationship manager for the stated period or until the wedding. While assigned, the relationship manager can read her requests, shortlist, checklist and vendor conversations to help, but cannot send messages as her or make bookings for her.',
      ],
    },
    {
      id: 'ip',
      heading: 'OLREADY’s intellectual property',
      body: [
        'All rights in OLREADY’s branding, software, databases, original content, invitation designs and platform materials remain with their owners. Using OLREADY gives limited access to the service, not ownership of the database, leads as a resale asset, software or intellectual property. Automated extraction, copying or commercial exploitation beyond authorised use is prohibited.',
      ],
    },
    {
      id: 'suspension',
      heading: 'Maintenance, suspension and termination',
      body: [
        'OLREADY may maintain, update and secure the platform and change non-material presentation or functionality without guaranteeing uninterrupted or error-free operation. We may immediately suspend affected access where reasonably necessary to address suspected fraud, compromised accounts, lead-data misuse, harassment, security threats or legal obligations, and may terminate for a substantiated serious or repeated breach. Where appropriate we will give notice and a chance to remedy a remediable breach.',
        'Suspension or termination for your breach does not itself create an entitlement to a refund of an activated plan. Any applicable mandatory remedy is preserved.',
      ],
    },
    {
      id: 'liability',
      heading: 'Disclaimers and limitation of liability',
      body: [
        'To the extent permitted by law, OLREADY excludes warranties not expressly stated, including fitness for a particular commercial outcome, uninterrupted availability and the accuracy of information supplied by vendors, brides and other third parties. OLREADY is not liable for the services, conduct, pricing or cancellations of vendors or brides.',
        'To the extent permitted by law, OLREADY is not liable for indirect, consequential, special or punitive loss, or loss of anticipated profits, bookings, opportunity, goodwill or savings. OLREADY’s aggregate monetary liability relating to a paid purchase is limited to the amount actually paid to OLREADY for it; for free use of the platform it is limited to ₹1,000. This cap does not reduce a refund expressly due under the Refund and Cancellation Policy.',
        'Nothing in these terms excludes or limits liability for OLREADY’s fraud or wilful misconduct, or any liability or remedy that applicable law does not permit to be excluded or limited. Mandatory consumer, privacy and other statutory rights apply where legally applicable.',
      ],
    },
    {
      id: 'indemnity',
      heading: 'Indemnity',
      body: [
        'You agree to indemnify OLREADY, its proprietor and personnel against third-party claims, damages and reasonable legal costs to the extent arising from your services (for vendors), unlawful use of enquiry or guest information, infringement by material you submit, fraud, or material breach of these terms or applicable law. The indemnity does not extend to losses caused by OLREADY’s own breach or wrongdoing.',
      ],
    },
    {
      id: 'law',
      heading: 'Governing law and exclusive Chandigarh jurisdiction',
      body: [
        'These terms and any dispute arising out of or in connection with the OLREADY website, accounts, content, transactions or services are governed by Indian law. To the fullest extent permitted by law, the courts of competent jurisdiction at Chandigarh, India have exclusive jurisdiction.',
        'This does not confer jurisdiction on a court that lacks it, restrict the reporting or investigation of an alleged criminal or cyber offence, or exclude jurisdiction or remedies that applicable law does not permit the parties to exclude, including those of statutory consumer or data-protection authorities.',
      ],
    },
    {
      id: 'contact',
      heading: 'Records, notices and grievances',
      body: [
        'OLREADY keeps payment, order, unlock, conversation, consent, complaint and agreement records to run the service and respond to disputes. These may be relied on as evidence, subject to verification; they are not conclusive in the face of a demonstrable error.',
        ...contact,
        'Updates will be dated and apply to future use and purchases, or to existing arrangements only where lawfully agreed or required. Later website edits do not silently rewrite an already accepted plan.',
      ],
    },
  ],
};

export const PRIVACY: Policy = {
  slug: 'privacy',
  title: 'Privacy Policy',
  summary: 'What we collect from brides, families and vendors, why, who sees it, how long we keep it and your choices.',
  sections: [
    {
      id: 'who',
      heading: 'Who is responsible',
      body: [
        `This Privacy Policy explains how OLREADY collects, uses, shares and retains personal information on the OLREADY marketplace and planning tools. The responsible operator is ${OPERATOR.name}. Business address: ${OPERATOR.address}. For privacy questions, email ${OPERATOR.email}.`,
        'This policy is a notice about information handling. Optional processing that needs consent, such as WhatsApp updates or marketing, is not authorised merely by accepting the Terms of Use.',
      ],
    },
    { id: 'continuity', heading: 'Business transition and earlier records', body: [continuity[0], 'Katalyst Infomedia handles the records it received for continuity of the service and the transferred obligations. The transition is not fresh consent to unrelated marketing or a new use. Existing opt-outs are respected.'] },
    {
      id: 'collect',
      heading: 'What we collect',
      body: [
        'Brides and families: name, email, phone, city, wedding date, functions and their dates, guest count, the vendor categories wanted, budgets, notes from our verification call, shortlist, checklist, budget, wedding wall, invitation details, guest names and phone numbers you add, RSVP replies, conversations and quotes, reviews and real-wedding submissions.',
        'Vendors: business and owner name, contact details, category, city and service towns, prices and details, photos and videos, billing name, address and GSTIN, plans, credits, unlocks, conversations, quotes, promotion settings and payments.',
        'Everyone: sign-in records, settings, support and callback requests, and the records needed for payments, invoices and refunds. Payment card, UPI and bank credentials are handled by the payment provider; we never ask for your card security code, UPI PIN or OTP.',
        'Provide only what is needed. If you add information about another person, such as a guest list, you must have their permission or another lawful basis to share it with us.',
      ],
    },
    {
      id: 'technology',
      heading: 'What we collect through technology',
      body: [
        'Our servers and providers process technical information such as IP address, browser and device details, timestamps, error records and security events to deliver and protect the service. Essential cookies keep you signed in and protect staff sign-in. We do not use advertising pixels, remarketing or session replay.',
        'To show vendors how many people saw their profile, we count visits on our own servers using a code made from the visitor’s IP address and browser with a secret that changes every day. The code cannot be turned back into the IP address and is not linked to an account. We do not use third-party analytics.',
      ],
    },
    {
      id: 'use',
      heading: 'Why we use it',
      body: [
        'To verify requests by calling the bride; show verified requests to matching vendors; run conversations, quotes, bookings and reviews; send service emails (new lead, new message, quote, quote accepted, reminders before functions, feedback after the wedding); run the planning tools and invitations; take payments, issue GST invoices and process refunds; provide relationship-manager help; prevent fraud and misuse; resolve disputes; and meet legal obligations.',
        'We use contact details for optional updates only where you have opted in. Ticking the WhatsApp box on a request, or turning on WhatsApp alerts as a vendor, permits WhatsApp messages about that activity; a STOP reply turns them off everywhere. Service emails can be switched off in your settings, and every email has an unsubscribe link.',
        'Processing takes place with your consent where required, and on other grounds permitted by applicable Indian law, including providing the service you asked for, legal compliance and handling disputes.',
      ],
    },
    {
      id: 'sharing-vendors',
      heading: 'What vendors see about a bride',
      body: [
        'Before verification, vendors see nothing. After verification, matching vendors see her first name, city, dates, functions, guest count, categories and budget, without contact details. A vendor that unlocks the request sees her name and phone number and can message her on OLREADY. If she sent a request to one vendor only, only that vendor sees it unless she chose to let others quote.',
        'Vendor phone numbers, emails and social handles are never shown publicly. A bride decides when to share more about herself in a conversation.',
      ],
    },
    {
      id: 'public',
      heading: 'Public pages and search engines',
      body: [
        'Vendor profiles, listings, published reviews (with the reviewer’s first name), approved real weddings, ideas photos and articles are public and may appear in search results. E-invite and RSVP pages are reachable by anyone with the link but are kept out of search engines. Search engines and visitors may cache or share public content; we cannot guarantee immediate removal of independent copies.',
      ],
    },
    {
      id: 'ai',
      heading: 'AI features',
      body: [
        'OLREADY uses Claude, provided by Anthropic, for these features: Ask OLREADY (the planning helper), reading quotes into what is included and what costs extra, search by photo, and an internal tool that answers staff questions from reporting data without names, phone numbers or emails.',
        'For Ask OLREADY, your messages and the parts of your wedding plan needed to answer (such as date, city, budget, shortlist and quotes) are sent to Anthropic to produce a reply. Vendor contact details are never sent. Chats are kept for 90 days after you last use them and then deleted; you can delete a chat sooner. OLREADY staff may review chats that our automatic checks flag, or that you mark as not helpful, to improve answers.',
        'For quote reading, only the category, amount and the vendor’s own quote text are sent; nothing about the bride. For search by photo, the image you choose is sent to read its styles and is not kept by OLREADY. AI output can be inaccurate; check important details with the vendor or our team. Anthropic may process data outside India.',
      ],
    },
    {
      id: 'providers',
      heading: 'Service providers and other recipients',
      body: [
        'We share information only as needed with authorised staff, assigned relationship managers, the vendors described above, and providers supporting our operations: Vercel (hosting), Supabase (database, sign-in and file storage, in Mumbai), Resend (email), Razorpay and PayU (payments), Anthropic (AI features), and Meta or Wati (WhatsApp messages, only where enabled and opted in).',
        'We may disclose information to professional advisers, tax authorities, regulators or law-enforcement bodies where legally required or reasonably necessary to establish, exercise or defend legal rights. We do not sell contact lists.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it',
      body: [
        'We keep information only as long as reasonably necessary for the purpose it was collected for, legal obligations and the establishment or defence of claims. Purchase, invoice, tax and refund records are kept for the statutory period. Requests, conversations and quotes are kept while the wedding is being planned and for a reasonable period after it for disputes and reviews. Ask OLREADY chats are deleted after 90 days without use. Email and WhatsApp opt-outs are kept so we can honour them.',
        'When information is no longer needed we delete it, anonymise it or restrict its use. Backups may remain until their normal secure replacement cycle. Providers may process information in India or other countries; we apply appropriate safeguards.',
      ],
    },
    {
      id: 'rights',
      heading: 'Security and your choices',
      body: [
        'We use reasonable technical and organisational measures, including access limited by role, authenticator codes for staff, encrypted connections and logged staff access to exports and chats. No website can guarantee absolute security. Report suspected unauthorised access to care@olready.in promptly.',
        'You may ask about your information, request access or correction, ask for deletion where appropriate, withdraw optional consent, nominate someone where the law provides for it, or raise a privacy grievance. We may verify identity first, and will explain where a request cannot be fully met because information is needed for a legal obligation or an unresolved claim. Rights under Indian data-protection law are honoured as those provisions take effect.',
      ],
    },
    {
      id: 'children',
      heading: 'Children',
      body: ['Accounts are for adults aged 18 or older. Do not submit a child’s personal information except as a guest name on your own guest list. Images of children must not be submitted for publication without the necessary rights and permissions.'],
    },
    {
      id: 'contact',
      heading: 'Contact, grievances and updates',
      body: [
        ...contact,
        'We may update this policy and will publish the updated date. Where a new use needs fresh notice or consent, we will ask before that use. This policy is governed by Indian law; the jurisdiction clause in the Terms of Use applies, without restricting complaints to a competent statutory authority.',
      ],
    },
  ],
};

export const REFUNDS: Policy = {
  slug: 'refunds',
  title: 'Refund and Cancellation Policy',
  summary: 'When money paid to OLREADY comes back: vendor plans, credits, the ads wallet and relationship-manager help.',
  sections: [
    {
      id: 'scope',
      heading: 'What this policy covers',
      body: [
        `This policy governs refunds of money paid to OLREADY for vendor plans, credit top-ups, ads-wallet top-ups, banners and relationship-manager help, and the lead-reversal benefit of the Phoenix plan. The operator is ${OPERATOR.name}. GSTIN: ${OPERATOR.gstin}.`,
        'It does not govern fees a bride pays a vendor for the vendor’s own services; those follow the vendor’s terms. Invitation-only plans such as Privy are governed by their separate signed agreements.',
      ],
    },
    {
      id: 'plans',
      heading: 'Vendor plans: activation is the cutoff',
      body: [
        'You may cancel a plan and get a refund before it is activated, including after signing while it is still inactive. If OLREADY cannot activate the plan, the payment is refunded. Activation is recorded when the plan is enabled for your business with its start and expiry dates; payment, invoice, onboarding and signature are not activation.',
        'Once activated, the plan fee is non-refundable and the plan is non-transferable for ordinary cancellation, non-use, unused enquiries, changed circumstances, client non-response or dissatisfaction with business results, unless OLREADY agrees otherwise in writing or the law requires otherwise.',
      ],
    },
    {
      id: 'credits',
      heading: 'Credit top-ups and fake enquiries',
      body: [
        'Credit top-ups are added to your account when payment is confirmed and never expire. You may request a refund of a top-up before any of its credits are used. Once credits have been used, the top-up is not refundable as cash.',
        'If a request you unlocked is removed because its details were false or wrong, the credits you spent on it are returned automatically. If you believe a request was false, report it from the conversation or to care@olready.in within seven days of unlocking it.',
      ],
    },
    {
      id: 'reversal',
      heading: 'Phoenix lead reversal',
      body: [
        'Lead reversal is a Phoenix plan benefit for an eligible lead unlocked during the activated plan period. An approved reversal restores the consumed entitlement or gives an equivalent replacement; it is not a cash refund, and the same lead cannot be credited twice. Only these grounds qualify, subject to timely reporting and verification: the client had already booked another vendor when first contacted; the client says they were never looking for this service; the client stays non-responsive to both you and OLREADY over five days of calls or WhatsApp attempts; the event moves to another state; or the event is cancelled.',
        'Report within seven days of unlocking and no later than seven days after plan expiry; the earlier deadline applies. Provide the lead, unlock date, issue and contact-attempt records. OLREADY decides within seven days of receipt. An approved claim after expiry comes with an extension to use the restored entitlement.',
      ],
    },
    {
      id: 'wallet',
      heading: 'Ads wallet, Boosts and banners',
      body: [
        'Ads-wallet top-ups are prepaid credit for promotion on OLREADY. You may request a refund of a top-up before any of it is spent. Once spending starts, the unspent balance stays in your wallet for future promotion and is not refundable as cash, except where OLREADY cannot provide promotion or the law requires a refund.',
        'Boosts are charged only for counted profile visits, at most once per visitor per day and within your daily budget; you can pause a Boost at any time. A banner that OLREADY declines, or that you cancel before its month starts, is credited back to your wallet in full.',
      ],
    },
    {
      id: 'rm',
      heading: 'Relationship-manager help for brides',
      body: [
        'If you bought relationship-manager help, you may cancel and get a full refund before a relationship manager is assigned. If OLREADY cannot approve the request, the payment is refunded. Once a relationship manager is assigned, the fee is not refundable for change of mind. Help given as a booking reward has no cash value.',
      ],
    },
    {
      id: 'how',
      heading: 'How to ask for a refund, and how it is paid',
      body: [
        'Email care@olready.in with your registered name, what you bought, the payment date and any order or payment reference, or use the published phone or WhatsApp channel and ask for the request to be registered. A missing order ID does not invalidate a request if the purchase can otherwise be identified. A request is assessed as at the time we receive it.',
        'For an eligible refund, OLREADY initiates it within 15 days of approval, normally to the original payment method; bank credit time is separate. The refund is of the amount actually paid, including the GST in it; coupon value is not refundable as cash. Every refund comes with a GST credit note. Verified duplicate or excess payments are always corrected.',
        'If a payment screen failed or stayed pending, contact us before paying again. An uncaptured payment may be reversed by your bank or the payment provider rather than refunded by OLREADY.',
      ],
    },
    {
      id: 'legacy',
      heading: 'Earlier plans, grievances and applicable law',
      body: [
        'Katalyst Infomedia administers running plans transferred from the previous operator, KSM Beauty Pvt Ltd. Those plans keep their agreed terms and original activation records; the transition does not create a new cancellation window.',
        ...contact,
        'Nothing in this policy excludes a right or liability that applicable law does not permit to be excluded. Indian law governs this policy, and the jurisdiction clause in the Terms of Use applies.',
      ],
    },
  ],
};

export const POLICIES = { terms: TERMS, privacy: PRIVACY, refunds: REFUNDS };
