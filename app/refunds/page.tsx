import { PolicyPage } from '@/components/PolicyPage';
import { REFUNDS } from '@/lib/legal';

export const metadata = { title: REFUNDS.title, description: REFUNDS.summary, alternates: { canonical: '/refunds' } };

export default function Page() {
  return <PolicyPage p={REFUNDS} />;
}
