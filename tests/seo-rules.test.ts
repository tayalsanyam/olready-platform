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
