import { PolicyPage } from '@/components/PolicyPage';
import { PRIVACY } from '@/lib/legal';

export const metadata = { title: PRIVACY.title, description: PRIVACY.summary, alternates: { canonical: '/privacy' } };

export default function Page() {
  return <PolicyPage p={PRIVACY} />;
}
