import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { mfaNeeded } from '@/lib/mfa';
import { taxDocument } from '@/lib/invoices';
import { invoicePdf } from '@/lib/invoicePdf';

/** A tax invoice or credit note as a PDF, for the buyer, the vendor's owner, or Ops. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await currentProfile();
  if (!p) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/invoices/${id}`)}`, req.url));
  const d = await taxDocument(sql, id);
  const staff = p.role === 'ops' || p.role === 'admin';
  if (!d || !(d.profile_id === p.id || d.vendor_owner === p.id || staff)) return new NextResponse('Not found', { status: 404 });
  if (staff && d.profile_id !== p.id && (await mfaNeeded(p.id))) return new NextResponse('Confirm your sign-in code first: open /mfa', { status: 403 });
  const bytes = await invoicePdf(d);
  const name = `${d.kind === 'credit_note' ? 'credit-note' : 'invoice'}-${d.number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
