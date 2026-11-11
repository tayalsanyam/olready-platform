import './helpers';
import { describe, expect, it } from 'vitest';
import { flagsFor } from '@/lib/moderation';

describe('automatic chat flags', () => {
  it('allows phone numbers and normal links', () => {
    expect(flagsFor('Call me on +91 98000 00001')).toEqual([]);
    expect(flagsFor('My work: https://instagram.com/glowbykirti and https://maps.app.goo.gl/x')).toEqual([]);
    expect(flagsFor('Order 1234567890123 is fine')).toEqual([]);
  });
  it('flags what Ops should look at', () => {
    expect(flagsFor('My card is 4111 1111 1111 1111')).toContain('card');
    expect(flagsFor('IFSC HDFC0001234 account 50100012345678')).toContain('card');
    expect(flagsFor('Share the OTP you got')).toContain('otp');
    expect(flagsFor('Please pay the advance directly to my GPay')).toContain('off_platform');
    expect(flagsFor('Book outside Olready and save')).toContain('off_platform');
    expect(flagsFor('See https://bit.ly/abc')).toContain('link');
    expect(flagsFor('you idiot')).toContain('abuse');
  });
});
