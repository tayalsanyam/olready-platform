import Link from 'next/link';
import { Container } from '@/components/ui';

export default function NotFound() {
  return (
    <Container className="max-w-md py-16 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Page not found</h1>
      <p className="mt-2 text-[var(--color-muted)]">It may have moved, or the profile is not live yet.</p>
      <Link href="/vendors" className="btn mt-5">
        Browse vendors
      </Link>
    </Container>
  );
}
