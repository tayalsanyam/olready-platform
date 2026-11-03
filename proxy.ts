import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase session on every page request. Server Components cannot
 * write cookies, so without this a signed-in user is silently signed out when the
 * access token expires (about an hour).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser() validates the token with Supabase and rotates it when needed.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static files, images and the public machine-readable endpoints.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|api/payments|api/cron|api/public|api/resend|api/unsubscribe|widget/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
};
