import { openCaptureCount } from '@/lib/captures';
import { openErrorCount } from '@/lib/errors';
import { requireStaff } from '@/lib/auth';
import { sql } from '@/lib/db';
import { OpsNav, type OpsGroup } from './OpsNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Ops', template: '%s | Ops' }, robots: { index: false } };

const ROLE_NAME: Record<string, string> = { admin: 'Admin', ops: 'Operations', content: 'Content', rm: 'Relationship manager' };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const p = await requireStaff();
  const ops = ['ops', 'admin'].includes(p.role);
  const content = ['content', 'ops', 'admin'].includes(p.role);
  const rm = ['rm', 'ops', 'admin'].includes(p.role);
  const admin = p.role === 'admin';
  // What is waiting, shown beside the menu items that clear it.
  const [c] = ops
    ? await sql<{ leads: number; capped: number; vendors: number; transfers: number; flagged: number; reviews: number; banners: number; rm: number; weddings: number }[]>`
        select
          (select count(*) from mkt.leads where status in ('new','verifying'))::int as leads,
          (select count(*) from mkt.lead_needs where status = 'capped' and reopen_rounds < 2)::int as capped,
          (select count(*) from mkt.vendors where status = 'pending_review')::int + (select count(*) from mkt.vendor_claims where status = 'submitted')::int as vendors,
          (select count(*) from mkt.orders where status = 'created' and gateway = 'manual')::int as transfers,
          (select count(*) from mkt.messages where review_status = 'flagged')::int as flagged,
          (select count(*) from mkt.reviews where status = 'pending')::int + (select count(*) from mkt.review_disputes where status in ('open','proof_submitted'))::int as reviews,
          (select count(*) from mkt.banners where status = 'pending')::int as banners,
          (select count(*) from mkt.rm_engagements where status = 'pending_approval')::int as rm,
          (select count(*) from mkt.real_weddings where status = 'submitted')::int as weddings`
    : [null];
  const errors = ops ? await openErrorCount(sql) : 0;
  const captures = await openCaptureCount(sql);
  const groups: OpsGroup[] = [
    {
      title: 'Work',
      items: [
        { href: '/ops', label: 'Today' },
        ...(ops
          ? [
              { href: '/ops/leads', label: 'Leads', count: (c?.leads ?? 0) + (c?.capped ?? 0) + captures },
              { href: '/ops/vendors', label: 'Vendors', count: c?.vendors },
              { href: '/ops/reviews', label: 'Reviews', count: c?.reviews },
              { href: '/ops/moderation', label: 'Moderation', count: c?.flagged },
            ]
          : []),
        ...(rm ? [{ href: '/ops/rm', label: p.role === 'rm' ? 'My brides' : 'Relationship managers', count: c?.rm }] : []),
      ],
    },
    ...(ops
      ? [
          {
            title: 'Money',
            items: [
              { href: '/ops/payments', label: 'Payments', count: c?.transfers },
              { href: '/ops/promotions', label: 'Promotions', count: c?.banners },
              { href: '/ops/coupons', label: 'Discount codes' },
            ],
          },
          {
            title: 'Messages',
            items: [
              { href: '/ops/emails', label: 'Email' },
              { href: '/ops/whatsapp', label: 'WhatsApp' },
            ],
          },
        ]
      : []),
    ...(content
      ? [
          {
            title: 'Content',
            items: [
              { href: '/ops/content', label: 'Real weddings', count: c?.weddings },
              { href: '/ops/articles', label: 'Articles' },
              { href: '/ops/collections', label: 'Collections' },
            ],
          },
        ]
      : []),
    ...(ops
      ? [
          {
            title: 'Insight',
            items: [
              { href: '/ops/data', label: 'Data' },
              { href: '/ops/assistant', label: 'Ask the data' },
              { href: '/ops/bride-ai', label: 'Ask Olready' },
            ],
          },
          {
            title: 'Setup',
            items: [
              ...(admin ? [{ href: '/ops/catalog', label: 'Categories' }] : []),
              { href: '/ops/places', label: 'Places' },
              { href: '/mfa?next=/ops', label: 'My authenticator' },
              ...(admin || p.role === 'ops' ? [{ href: '/ops/errors', label: 'Errors', count: errors }] : []),
              ...(admin
                ? [
                    { href: '/ops/staff', label: 'Staff' },
                    { href: '/ops/settings', label: 'Settings' },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-[1440px] px-4 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
      <OpsNav groups={groups} who={`${p.full_name || p.email} · ${ROLE_NAME[p.role] ?? p.role}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
