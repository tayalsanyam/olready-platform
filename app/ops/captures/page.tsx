import { redirect } from 'next/navigation';

/** Numbers to call now live inside Leads. */
export default function Captures() {
  redirect('/ops/leads?tab=call');
}
