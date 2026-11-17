import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { listCities } from '@/lib/catalog';
import { canTeach, classesForVendor, classFee, classLength, classWhen, LEVELS, MODES } from '@/lib/classes';
import { vendorAddClass, vendorCancelClass, vendorSetSignup } from '@/lib/actions/classes';
import { Badge, Card, Empty, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Classes', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function VendorClasses({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/classes');
  if (!(await canTeach(sql, vendor.id))) {
    return (
      <>
        <PageTitle title="Classes" />
        <Empty title="Classes are for makeup and mehendi artists">If you teach and your category is different, write to us from the Contact page.</Empty>
      </>
    );
  }
  const [classes, cities] = await Promise.all([classesForVendor(sql, vendor.id), listCities(sql)]);
  const now = Date.now();
  return (
    <>
      <PageTitle
        title="Classes"
        sub="Teach self-makeup or mehendi. List a class, and people ask for a seat with their name and number. You call them, confirm the seat and take the fee yourself."
        action={
          <Link href="/classes" className="btn btn-ghost btn-sm">
            See the Classes page
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      {classes.length ? (
        <ul className="space-y-4">
          {classes.map((c) => {
            const past = c.starts_at.getTime() < now;
            return (
              <li key={c.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">
                        {c.status === 'live' && !past ? <Link href={`/classes/${c.id}`}>{c.title}</Link> : c.title}
                      </h2>
                      <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                        {classWhen(c.starts_at)}, {classLength(c.duration_min)}. {c.mode === 'online' ? 'Online' : [c.venue, c.city].filter(Boolean).join(', ')}. {classFee(c.fee_inr)} a seat.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={c.status === 'live' && !past ? 'ok' : 'plain'}>
                        {c.status === 'cancelled' ? 'Cancelled' : c.status === 'hidden' ? 'Hidden by Olready' : past ? 'Finished' : `${c.taken} of ${c.seats} seats asked for`}
                      </Badge>
                      {c.status === 'live' && !past ? (
                        <form action={vendorCancelClass}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn btn-ghost btn-sm">Cancel class</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  {c.signups.length ? (
                    <ul className="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
                      {c.signups.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            <b>{s.name}</b>{' '}
                            <a href={`tel:${s.phone}`} className="underline">
                              {s.phone}
                            </a>
                            {s.note ? <span className="block text-[var(--color-muted)]">{s.note}</span> : null}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={s.status === 'confirmed' ? 'ok' : 'plain'}>{s.status === 'new' ? 'To call' : s.status === 'confirmed' ? 'Confirmed' : 'Released'}</Badge>
                            {(['confirmed', 'cancelled'] as const)
                              .filter((x) => x !== s.status)
                              .map((x) => (
                                <form key={x} action={vendorSetSignup}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="status" value={x} />
                                  <button className="btn btn-ghost btn-sm">{x === 'confirmed' ? 'Confirm seat' : 'Release seat'}</button>
                                </form>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : c.status === 'live' && !past ? (
                    <p className="mt-3 text-sm text-[var(--color-muted)]">Nobody has asked for a seat yet. Share the class link on your Instagram.</p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No classes yet">List your first class below. It appears on the Classes page and on your profile at once.</Empty>
      )}

      <Card className="mt-6" id="new">
        <h2 className="font-semibold">List a class</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Leave out phone numbers and links: seat requests reach you here, with the person’s name and number.</p>
        <form action={vendorAddClass} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name of the class">
              <input name="title" className="input" required minLength={4} maxLength={90} placeholder="Self-makeup for wedding guests" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="What she will learn">
              <textarea name="summary" className="input" rows={3} maxLength={800} placeholder="Skin prep, base that lasts, eyes for day and night, and how to drape a dupatta without help." />
            </Field>
          </div>
          <Field label="Date">
            <input type="date" name="day" className="input" required />
          </Field>
          <Field label="Starts at">
            <input type="time" name="time" className="input" defaultValue="11:00" required />
          </Field>
          <Field label="Length">
            <select name="hours_x10" className="input" defaultValue="30">
              {[10, 15, 20, 30, 40, 50, 60, 80].map((h) => (
                <option key={h} value={h}>
                  {h / 10} {h === 10 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="For">
            <select name="level" className="input">
              {Object.entries(LEVELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Seats">
            <input name="seats" className="input" inputMode="numeric" required defaultValue="8" />
          </Field>
          <Field label="Fee per seat, ₹" hint="0 for a free class">
            <input name="fee_inr" className="input" inputMode="numeric" required placeholder="2500" />
          </Field>
          <Field label="How">
            <select name="mode" className="input">
              {Object.entries(MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Town" hint="For in-person classes">
            <select name="city_id" className="input" defaultValue={vendor.city_id}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where" hint="Studio name and area, or the app for an online class">
            <input name="venue" className="input" maxLength={120} placeholder="Studio, Sector 35" />
          </Field>
          <Field label="What is included" hint="Kit, notes, a certificate">
            <input name="includes" className="input" maxLength={300} placeholder="Practice kit to use in class, printed notes" />
          </Field>
          <div className="sm:col-span-2">
            <button className="btn">List class</button>
          </div>
        </form>
      </Card>
    </>
  );
}
