import { ogCard, OG_SIZE } from '@/lib/og';

export const alt = 'List your wedding business on Olready';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogCard({ label: 'For wedding businesses across India', title: 'Wedding enquiries that are real before you pay for them', facts: ['Free to list', 'Every bride verified on a call', 'GST invoice included'] });
}
