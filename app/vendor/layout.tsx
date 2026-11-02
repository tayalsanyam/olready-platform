import { Container } from '@/components/ui';
import { VendorTabs } from './tabs';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <VendorTabs />
      {children}
    </Container>
  );
}
