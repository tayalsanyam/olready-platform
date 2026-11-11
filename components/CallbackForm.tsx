import { CALLBACK_TOPICS } from '@/lib/vendorTools';
import { requestCallbackAction } from '@/lib/actions/vendorTools';
import { Card, Field } from './ui';

/** "Ask Olready to call me" for vendors and brides. Ops see it at the top of their Today page. */
export function CallbackForm({ phone, backPath, topics }: { phone?: string | null; backPath: string; topics: (keyof typeof CALLBACK_TOPICS)[] }) {
  return (
    <Card>
      <h2 className="font-semibold">Talk to our team</h2>
      <p className="hint mt-1">Leave your number and we will call you, Monday to Saturday, 10:00 to 18:30.</p>
      <form action={requestCallbackAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="_back" value={backPath} />
        <Field label="About">
          <select name="topic" className="input" defaultValue={topics[0]}>
            {topics.map((t) => (
              <option key={t} value={t}>
                {CALLBACK_TOPICS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mobile number">
          <input name="phone" required inputMode="tel" className="input" defaultValue={phone ?? ''} />
        </Field>
        <Field label="Best time (optional)">
          <input name="when" maxLength={60} className="input" placeholder="e.g. after 4 pm" />
        </Field>
        <Field label="Anything we should know? (optional)">
          <input name="note" maxLength={500} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <button className="btn btn-sm">Request a call</button>
        </div>
      </form>
    </Card>
  );
}
