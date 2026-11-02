import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/auth';

/** Magic-link sign-in from the Supabase email template ({{ .TokenHash }}). */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = (req.nextUrl.searchParams.get('type') ?? 'email') as EmailOtpType;
  const raw = req.nextUrl.searchParams.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  if (tokenHash) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, req.url));
  }
  return NextResponse.redirect(new URL('/login?error=That%20link%20has%20expired', req.url));
}
