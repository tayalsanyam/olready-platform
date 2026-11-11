import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetDb, testSql } from './helpers';

const generateLink = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { generateLink } } }) }));

const sql = testSql();
afterAll(() => sql.end());
afterEach(() => vi.unstubAllGlobals());
beforeAll(() => {
  resetDb();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.RESEND_API_KEY = 're_test';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://olready.example';
});

describe('the sign-in email', () => {
  it('is sent by us with a code and a link to this site, and falls back if that fails', async () => {
    const { sendSignInCode } = await import('@/lib/signin');
    generateLink.mockResolvedValue({ data: { properties: { email_otp: '482913', hashed_token: 'hash/abc', verification_type: 'magiclink' } }, error: null });
    const sent: { to: string; subject: string; text: string; from: string }[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    });
    expect(await sendSignInCode(sql, { email: 'simran@example.com', name: 'Simran', next: '/welcome?as=bride' })).toBe('own');
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'simran@example.com', options: { data: { full_name: 'Simran' } } });
    expect(sent[0].to).toBe('simran@example.com');
    expect(sent[0].subject).toBe('482913 is your Olready code');
    expect(sent[0].text).toContain('https://olready.example/auth/confirm?token_hash=hash%2Fabc&type=magiclink&next=%2Fwelcome%3Fas%3Dbride');
    expect(sent[0].text).not.toMatch(/localhost|supabase\.co/);
    // The log shows a code went out, never the code.
    const [log] = await sql<{ payload: object; sent: boolean }[]>`select payload, sent_at is not null as sent from mkt.email_outbox where to_email = 'simran@example.com'`;
    expect(log).toEqual({ payload: {}, sent: true });

    // Resend refuses (say, the sending domain is not verified yet): Supabase's own email is used, and Ops > Errors says why.
    vi.stubGlobal('fetch', async () => new Response('{"message":"domain not verified"}', { status: 403 }));
    expect(await sendSignInCode(sql, { email: 'meher@example.com', next: '/welcome' })).toBe('fallback');
    const [err] = await sql<{ message: string }[]>`select message from mkt.error_events`;
    expect(err.message).toMatch(/Sign-in email could not be sent by Resend: Resend 403/);

    // Hammering one address is stopped.
    await sql`insert into mkt.email_outbox (to_email, template, payload, sent_at) select 'flood@example.com', 'login_code', '{}'::jsonb, now() from generate_series(1, 10)`;
    await expect(sendSignInCode(sql, { email: 'flood@example.com', next: '/welcome' })).rejects.toThrow(/Too many codes/);
  });
});
