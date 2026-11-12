import { redirect } from 'next/navigation';

/** Capped leads now live inside Leads. */
export default function Needs() {
  redirect('/ops/leads?tab=capped');
}
