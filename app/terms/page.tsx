import { PolicyPage } from '@/components/PolicyPage';
import { TERMS } from '@/lib/legal';

export const metadata = { title: TERMS.title, description: TERMS.summary, alternates: { canonical: '/terms' } };

export default function Page() {
  return <PolicyPage p={TERMS} />;
}
