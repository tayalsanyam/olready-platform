import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profile, resetDb, testSql } from './helpers';
import { fingerprintOf, listErrors, openErrorCount, recordError, resolveError, scrubPath } from '@/lib/errors';
import { functionsFromForm } from '@/lib/functions';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(async () => {
  resetDb();
  await sql`insert into mkt.settings (key, value) values ('staff_alert_emails', ${sql.json(['dev@olready.test'])}) on conflict (key) do update set value = excluded.value`;
  await sql`update mkt.settings set value = '0' where key in ('staff_quiet_from_hour', 'staff_quiet_to_hour')`;
});

describe('error monitoring', () => {
  it('hides private tokens and ids in page addresses', () => {
    expect(scrubPath('/claim/AbCdEfGhIjKlMnOpQrStUvWx?x=1')).toBe('/claim/:token');
    expect(scrubPath('/ops/leads/3f2b8c1e-1111-4222-8333-abcdefabcdef')).toBe('/ops/leads/:id');
    expect(scrubPath('/vendors/chandigarh/bridal-makeup')).toBe('/vendors/chandigarh/bridal-makeup');
    expect(fingerprintOf({ kind: 'server', message: 'Row 12 missing', route: '/x', path: null })).toBe(fingerprintOf({ kind: 'server', message: 'Row 99 missing', route: '/x', path: null }));
  });

  it('groups repeats, alerts the team once, and reopens a fixed fault', async () => {
    const admin = await profile(sql, 'admin', 'Admin');
    const boom = { kind: 'server' as const, message: 'Cannot read properties of undefined (reading "slug")', stack: 'TypeError: …\n at Page (app/v/[slug]/page.tsx:42)', path: '/v/glow-by-kirti?ref=home', route: '/v/[slug]', routeType: 'render', method: 'GET' };
    expect(await recordError(sql, boom)).toEqual({ stored: true, isNew: true });
    expect(await recordError(sql, boom)).toEqual({ stored: true, isNew: false });
    await recordError(sql, { ...boom, path: '/v/lens-and-light' });
    const [row] = await listErrors(sql);
    expect(row).toMatchObject({ occurrences: 3, route: '/v/[slug]', kind: 'server', path: '/v/lens-and-light' });
    expect(await openErrorCount(sql)).toBe(1);
    const alerts = await sql<{ payload: { what: string; detail: string; link: string } }[]>`select payload from mkt.email_outbox where to_email = 'dev@olready.test'`;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload.what).toBe('Something broke on the site');
    expect(alerts[0].payload.link).toMatch(/\/ops\/errors$/);

    // Not faults: redirects and abandoned requests.
    expect((await recordError(sql, { kind: 'server', message: 'NEXT_REDIRECT' })).stored).toBe(false);
    expect((await recordError(sql, { kind: 'client', message: 'Failed to fetch' })).stored).toBe(false);
    // Personal details and keys never reach the log.
    await recordError(sql, { kind: 'client', message: 'Bad input for simran@example.com phone +91 98765 43210 key sk-ant-abcdefghijklmnop', path: '/enquire' });
    const [leak] = await sql<{ message: string }[]>`select message from mkt.error_events where path = '/enquire'`;
    expect(leak.message).toBe('Bad input for <email> phone <number> key <key>');

    await resolveError(sql, row.id, admin.id);
    expect((await listErrors(sql)).map((e) => e.id)).not.toContain(row.id);
    expect(await recordError(sql, boom)).toEqual({ stored: true, isNew: true });
    expect((await listErrors(sql)).find((e) => e.id === row.id)?.occurrences).toBe(1);
  });
});

describe("the bride's own form", () => {
  it('reads a different town for one function', () => {
    const fd = new FormData();
    fd.set('fn_name_0', 'Wedding');
    fd.set('fn_date_0', '2027-02-14');
    fd.set('fn_name_1', 'Reception');
    fd.set('fn_city_1', '42');
    fd.set('fn_place_1', 'The Leela');
    fd.set('fn_name_2', 'Mehendi');
    fd.set('fn_city_2', 'abc');
    const { fns } = functionsFromForm(fd);
    expect(fns.map((f) => [f.name, f.cityId])).toEqual([['Wedding', null], ['Reception', 42], ['Mehendi', null]]);
  });
});
