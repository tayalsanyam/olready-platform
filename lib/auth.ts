import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { sql } from './db';

export type Role = 'bride' | 'vendor' | 'ops' | 'rm' | 'content' | 'admin';
export type Profile = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
  full_name: string;
  role: Role;
};

export const STAFF_ROLES: Role[] = ['ops', 'rm', 'content', 'admin'];
export const DEV_COOKIE = 'olr_dev_uid';

export function devAuthEnabled() {
  return process.env.DEV_AUTH === '1' && process.env.NODE_ENV !== 'production';
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component: cookies are read-only there.
          }
        },
      },
    }
  );
}

/** The signed-in person's profile, or null. Creates a bride profile on first sign-in. */
export async function currentProfile(): Promise<Profile | null> {
  if (devAuthEnabled()) {
    const id = (await cookies()).get(DEV_COOKIE)?.value;
    if (!id) return null;
    const [p] = await sql<Profile[]>`select * from mkt.profiles where id = ${id}`;
    return p ?? null;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [existing] = await sql<Profile[]>`select * from mkt.profiles where auth_user_id = ${user.id}`;
  if (existing) return existing;
  // An Ops-created profile (e.g. a migrated artist) is linked by email on first sign-in.
  const email = user.email?.toLowerCase() ?? null;
  const [linked] = await sql<Profile[]>`
    update mkt.profiles set auth_user_id = ${user.id}
    where email = ${email} and auth_user_id is null
    returning *`;
  if (linked) return linked;
  const [created] = await sql<Profile[]>`
    insert into mkt.profiles (auth_user_id, email, full_name, role)
    values (${user.id}, ${email}, ${(user.user_metadata?.full_name as string) ?? ''}, 'bride')
    returning *`;
  // Enquiries sent before signing up are attached by email.
  await sql`update mkt.leads set bride_profile_id = ${created.id} where bride_profile_id is null and email = ${email}`;
  return created;
}

export async function requireProfile(next = '/'): Promise<Profile> {
  const p = await currentProfile();
  if (!p) redirect(`/login?next=${encodeURIComponent(next)}`);
  return p;
}

export async function requireRole(roles: Role[], next = '/'): Promise<Profile> {
  const p = await requireProfile(next);
  if (!roles.includes(p.role)) redirect('/?denied=1');
  return p;
}

export const requireStaff = (next = '/ops') => requireRole(STAFF_ROLES, next);
export const requireAdmin = (next = '/ops') => requireRole(['admin'], next);

export function canDownload(p: Profile) {
  // Employees get role-based views without downloads; only admins export.
  return p.role === 'admin';
}
