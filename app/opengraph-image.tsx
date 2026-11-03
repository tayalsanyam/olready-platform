import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'OLReady: wedding vendors we have checked first';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogCard({ label: 'Chandigarh, Mohali, Panchkula and nearby towns', title: 'Plan your wedding with vendors we have checked first', facts: ['Every request verified on a call', 'Compare quotes', 'Free to use'] });
}
