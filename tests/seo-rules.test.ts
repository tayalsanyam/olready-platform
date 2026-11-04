import './helpers';
import { describe, expect, it } from 'vitest';
import { PRIVATE_PATHS } from '@/app/robots';

// The same matching Google uses: a rule is a path prefix; "$" anchors the end; "*" is a wildcard.
function blocked(path: string) {
  return PRIVATE_PATHS.some((rule) => {
    const re = new RegExp('^' + rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
    return re.test(path);
  });
}

describe('robots.txt', () => {
  it('keeps every public page crawlable', () => {
    for (const p of ['/', '/vendors', '/vendors/chandigarh', '/vendors/mohali/venues', '/vendors/mohali/venues/banquet-hall', '/v/glow-by-kirti-demo', '/invitations', '/invitations/ivory-gold', '/ideas', '/ideas/photo/v-1', '/blog', '/real-weddings', '/for-vendors', '/collections/x', '/search', '/look', '/enquire', '/cost/mohali/venues', '/terms', '/privacy', '/directory'])
      expect(blocked(p), p).toBe(false);
  });
  it('keeps private areas out of search', () => {
    for (const p of ['/me', '/me/budget', '/vendor', '/vendor/packs', '/ops', '/ops/data', '/api/assistant', '/login', '/invite/abc', '/rsvp/abc', '/invoices/x', '/pay/x', '/go/boost/x'])
      expect(blocked(p), p).toBe(true);
  });
});

describe('filter page titles', async () => {
  const { landingTitle } = await import('@/lib/seo');
  const cat = (plural_name: string) => ({ plural_name }) as never;
  const city = { name: 'Mohali' } as never;
  const f = (label: string, value: unknown, key = 'k') => ({ slug: 's', label, value, field: { key } }) as never;
  it('reads like a search, never repeating the category', () => {
    expect(landingTitle(cat('Bridal makeup artists'), city, f('Airbrush makeup', 'airbrush'))).toBe('Airbrush makeup artists in Mohali');
    expect(landingTitle(cat('Wedding venues'), city, f('Alcohol allowed', true))).toBe('Alcohol allowed wedding venues in Mohali');
    expect(landingTitle(cat('Mehendi artists'), city, f('Travels to venue', true))).toBe('Mehendi artists in Mohali who travel to venue');
    expect(landingTitle(cat('Wedding venues'), city, f('200+ guests', { min: 200 }))).toBe('Wedding venues in Mohali for 200+ guests');
  });
});

describe('redirect messages', async () => {
  const { withParam } = await import('@/lib/actions/run');
  it('keeps the query and puts the anchor after the message', () => {
    expect(withParam('/vendor/profile#where', 'ok', 'Saved')).toBe('/vendor/profile?ok=Saved#where');
    expect(withParam('/ops/places?q=moh&error=x', 'ok', 'Done')).toBe('/ops/places?q=moh&ok=Done');
  });
});

describe('first admin', async () => {
  const { listedAdmin } = await import('@/lib/auth');
  it('only emails in ADMIN_EMAILS, case-insensitive', () => {
    process.env.ADMIN_EMAILS = 'Owner@OLReady.in, ops-lead@olready.in';
    expect(listedAdmin('owner@olready.in')).toBe(true);
    expect(listedAdmin('OPS-LEAD@olready.in')).toBe(true);
    expect(listedAdmin('someone@olready.in')).toBe(false);
    expect(listedAdmin(null)).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(listedAdmin('owner@olready.in')).toBe(false);
  });
});
