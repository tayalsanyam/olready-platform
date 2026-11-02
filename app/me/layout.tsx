import { Container } from '@/components/ui';
import { BrideTabs } from './tabs';

export default function BrideLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <BrideTabs />
      {children}
    </Container>
  );
}
