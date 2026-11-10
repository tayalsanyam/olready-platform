import { describe, expect, it } from 'vitest';
import { fmtDate, fmtDateTime, fmtTime, plural } from '@/lib/dates';

describe('dates shown in India time', () => {
  it('shows the Indian day and clock for a late-evening UTC time', () => {
    const d = new Date('2026-11-10T19:15:00Z'); // 12:45 am on the 11th in India
    expect(fmtDate(d)).toMatch(/11 Nov 2026/);
    expect(fmtDateTime(d)).toMatch(/11 Nov 2026/);
    expect(fmtTime(d).toLowerCase()).toMatch(/12:45\s?am/);
  });
  it('reads a plain date without shifting it', () => {
    expect(fmtDate('2027-02-14')).toMatch(/14 Feb 2027/);
  });
  it('counts in words', () => {
    expect(plural(1, 'bride')).toBe('1 bride');
    expect(plural(3, 'bride')).toBe('3 brides');
    expect(plural(2, 'enquiry', 'enquiries')).toBe('2 enquiries');
  });
});
