import Link from 'next/link';
import { sql } from '@/lib/db';
import { listCategories, listCities } from '@/lib/catalog';
import { Container } from '@/components/ui';
import { Toran } from '@/components/Toran';

export const metadata = {
  title: 'About OLReady',
  description:
    'OLReady is the Tricity’s wedding marketplace: venues, caterers, makeup artists, photographers and more in Chandigarh, Mohali, Panchkula and nearby towns, with every enquiry verified on a call.',
  alternates: { canonical: '/about' },
};

export default async function About() {
  const [cats, cities, [n]] = await Promise.all([
    listCategories(sql, { activeOnly: true }),
    listCities(sql),
    sql<{ vendors: number; weddings: number }[]>`
      select (select count(*)::int from mkt.vendors where status = 'live') as vendors,
             (select count(*)::int from mkt.real_weddings where status = 'published') as weddings`,
  ]);
  return (
    <>
      <section className="-mt-6 bg-[var(--color-tint)]">
        <Toran />
        <Container className="max-w-3xl pb-12 pt-4">
          <h1 className="text-4xl leading-tight sm:text-5xl">A wedding marketplace that picks up the phone.</h1>
          <p className="mt-4 text-lg text-[var(--color-muted)]">
            OLReady began in Chandigarh as a marketplace for bridal makeup artists. It now covers the whole wedding, from the venue and caterer to the
            mehendi and the dhol, with the same promise: real enquiries, honest prices and reviews from people who were there.
          </p>
        </Container>
      </section>
      <Container className="mt-12 max-w-3xl">
        <h2 className="text-2xl font-semibold">What we do differently</h2>
        <div className="mt-4 space-y-5 text-[15px] leading-relaxed">
          <p>
            <b>We call every bride.</b> Before any vendor sees a request, someone from our team confirms the date, city, functions and budget. Vendors spend
            their time on weddings that are real, and brides hear from vendors who want their wedding.
          </p>
          <p>
            <b>Numbers stay private.</b> Vendors message and quote on OLReady first. A bride decides when to share her number, and vendors’ own contact
            details are never published.
          </p>
          <p>
            <b>One request, every vendor.</b> One form covers venue, caterer, makeup, photos, decor and the rest, with each function’s date and guests, so
            nobody fills in ten forms.
          </p>
          <p>
            <b>Sponsored is always labelled.</b> Vendors can promote their profile, and every promoted place says so. It never changes the regular results or
            what our planning helper suggests.
          </p>
        </div>
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          Today: {n.vendors} checked businesses in {cats.length} categories across {cities.map((c) => c.name).join(', ')}
          {n.weddings ? `, and ${n.weddings} real weddings shared by couples` : ''}.
        </p>
        <h2 className="mt-12 text-2xl font-semibold">Who runs OLReady</h2>
        <p className="mt-3 text-[15px] leading-relaxed">
          OLReady is operated by Katalyst Infomedia from Sector 17, Chandigarh. Katalyst Infomedia took over the OLReady brand, its clients and running
          plans from KSM Beauty Pvt Ltd, and runs both the marketplace and the vendor plans.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/enquire" className="btn btn-pink">
            Get verified quotes
          </Link>
          <Link href="/for-vendors" className="btn btn-ghost">
            List your business
          </Link>
          <Link href="/contact" className="btn btn-ghost">
            Contact us
          </Link>
        </div>
      </Container>
    </>
  );
}
