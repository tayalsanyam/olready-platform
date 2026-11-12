import { redirect } from 'next/navigation';

/** Plan usage now lives inside Vendors. */
export default function PlanUsage() {
  redirect('/ops/vendors?tab=behind');
}
