import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/auth';
import { MFA_COOKIE } from '@/lib/mfa';

/** Magic-link sign-in from the Supabase email template ({{ .TokenHash }}). */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = (req.nextUrl.searchParams.get('type') ?? 'email') as EmailOtpType;
  const raw = req.nextUrl.searchParams.get('next') ?? '/';
  const safe = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  // Every sign-in passes through /welcome (mobile number once; staff to Ops).
  const next = safe.startsWith('/welcome') ? safe : `/welcome?next=${encodeURIComponent(safe)}`;
  if (tokenHash) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      (await cookies()).delete(MFA_COOKIE);
      return NextResponse.redirect(new URL(next, req.url));
    }
  }
  return NextResponse.redirect(new URL('/login?error=That%20link%20has%20expired', req.url));
}
