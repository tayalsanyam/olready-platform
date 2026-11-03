import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cityId, liveVendor, profile, resetDb, testSql } from './helpers';
import { coordsFromMapLink, localityBySlug, pincodeInfo, publicAddress, resolvePlace, saveVendorPlace, searchPlaces } from '@/lib/locations';
import { getVendorBySlug, publicVendor } from '@/lib/vendors';
import { gstinValid } from '@/lib/gst';
import { landingEntries, landingTitle } from '@/lib/seo';
import { listCities } from '@/lib/catalog';

const sql = testSql();
afterAll(() => sql.end());
beforeAll(() => resetDb());

describe('towns and pincodes across India', () => {
  it('every district is a town; only launched towns show in menus', async () => {
    const [{ towns, states }] = await sql<{ towns: number; states: number }[]>`
      select count(*)::int as towns, count(distinct state_code)::int as states from mkt.cities where active`;
    expect(towns).toBeGreaterThan(600);
    expect(states).toBeGreaterThan(30);
    const launched = await listCities(sql);
    expect(launched.map((c) => c.slug)).toEqual(expect.arrayContaining(['chandigarh', 'mohali', 'panchkula', 'zirakpur']));
    expect(launched.length).toBeLessThan(20);
  });

  it('maps pincodes to the right town, including Mohali offices filed under Rupnagar', async () => {
    expect((await pincodeInfo(sql, '160022'))?.city_slug).toBe('chandigarh');
    const mohali = await pincodeInfo(sql, '160055');
    expect(mohali?.city_slug).toBe('mohali');
    expect(mohali?.state).toBe('Punjab');
    expect(mohali?.offices).toContain('Sector 55 (Mohali)');
    expect((await pincodeInfo(sql, '140603'))?.city_slug).toBe('zirakpur');
    expect((await pincodeInfo(sql, '134109'))?.city_slug).toBe('panchkula');
    expect((await pincodeInfo(sql, '110001'))?.city_slug).toBe('delhi');
    expect(await pincodeInfo(sql, '999999')).toBeNull();
    const [{ unmapped }] = await sql<{ unmapped: number }[]>`select count(*)::int as unmapped from mkt.pincodes where city_id is null`;
    expect(unmapped).toBe(0);
  });

  it('finds towns by name, old name or pincode, and areas inside a town', async () => {
    const gurgaon = await searchPlaces(sql, 'Gurgaon');
    expect(gurgaon[0]).toMatchObject({ kind: 'town', city: 'Gurugram', state: 'Haryana' });
    const pin = await searchPlaces(sql, '160022');
    expect(pin[0]).toMatchObject({ kind: 'pincode', pincode: '160022', city: 'Chandigarh' });
    const chd = await cityId(sql, 'chandigarh');
    const areas = await searchPlaces(sql, 'sector 3', { cityId: chd });
    expect(areas.every((a) => a.kind === 'area')).toBe(true);
    expect(areas.map((a) => (a.kind === 'area' ? a.area : ''))).toContain('Sector 35');
    expect(await searchPlaces(sql, 'x')).toEqual([]);
    // Wildcards are text, not patterns.
    expect(await searchPlaces(sql, '%%')).toEqual([]);
  });

  it('checks town, area and pincode belong together', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const mohali = await cityId(sql, 'mohali');
    const s35 = await localityBySlug(sql, chd, 'sector-35');
    expect(s35?.pincode).toBe('160022');
    expect(await resolvePlace(sql, { cityId: null, localityId: null, pincode: '160022' })).toMatchObject({ cityId: chd, pincode: '160022' });
    expect((await resolvePlace(sql, { cityId: chd, localityId: null, pincode: '160022' })).localityId).not.toBeNull();
    await expect(resolvePlace(sql, { cityId: mohali, localityId: null, pincode: '160022' })).rejects.toThrow(/is in Chandigarh, not Mohali/);
    await expect(resolvePlace(sql, { cityId: chd, localityId: null, pincode: '16002' })).rejects.toThrow(/6 digits/);
    await expect(resolvePlace(sql, { cityId: chd, localityId: null, pincode: '999999' })).rejects.toThrow(/could not find/);
    await expect(resolvePlace(sql, { cityId: null, localityId: null, pincode: null })).rejects.toThrow(/Choose your town/);
    // An area from another town is dropped rather than stored.
    expect((await resolvePlace(sql, { cityId: mohali, localityId: s35!.id, pincode: null })).localityId).toBeNull();
  });
});

describe('vendor addresses', () => {
  it('stores the address, shows it only when public, and builds area pages', async () => {
    const chd = await cityId(sql, 'chandigarh');
    const s35 = (await localityBySlug(sql, chd, 'sector-35'))!;
    const vendors = [];
    for (const name of ['Rose Banquet', 'Lotus Hall', 'Marigold Lawns']) {
      const o = await profile(sql, 'vendor', name);
      const v = await liveVendor(sql, o.id, 'venues', 'chandigarh', name);
      vendors.push({ v, o });
    }
    const { v, o } = vendors[0];
    await saveVendorPlace(
      sql,
      v.id,
      { cityId: chd, localityId: s35.id, pincode: '160022', addressLine: 'SCO 12, Sector 35-C', mapsUrl: 'https://www.google.com/maps/place/Rose/@30.7226,76.7590,17z', addressPublic: false, serviceCityIds: [await cityId(sql, 'mohali')] },
      o.id
    );
    const raw = (await getVendorBySlug(sql, v.slug))!;
    expect(raw.locality_name).toBe('Sector 35');
    expect(raw.lat).toBe('30.72260');
    expect(raw.service_city_ids).toHaveLength(2);
    const hidden = publicVendor(raw);
    expect(hidden.address_line).toBeNull();
    expect(hidden.maps_url).toBeNull();
    expect(publicAddress({ ...hidden, locality: raw.locality_name ?? null, city: raw.city_name })).toEqual({ line: 'Sector 35, Chandigarh', full: false });
    await sql`update mkt.vendors set address_public = true where id = ${v.id}`;
    const shown = publicVendor((await getVendorBySlug(sql, v.slug))!);
    expect(shown.address_line).toBe('SCO 12, Sector 35-C');
    await expect(
      saveVendorPlace(sql, v.id, { cityId: chd, localityId: null, pincode: null, addressLine: '', mapsUrl: 'https://evil.example/maps', addressPublic: true, serviceCityIds: [] }, o.id)
    ).rejects.toThrow(/Google Maps link/);
    // Three venues in Sector 35 make an area page.
    for (const x of vendors.slice(1)) await sql`update mkt.vendors set locality_id = ${s35.id} where id = ${x.v.id}`;
    const entries = await landingEntries(sql);
    expect(entries.find((e) => e.path === '/vendors/chandigarh/venues/sector-35')?.title).toBe('Wedding venues in Sector 35, Chandigarh');
    expect(entries.some((e) => e.path === '/vendors/india/venues')).toBe(true);
    expect(landingTitle({ plural_name: 'Wedding venues' } as never, { name: 'Sector 35, Chandigarh' } as never)).toBe('Wedding venues in Sector 35, Chandigarh');
  });

  it('reads coordinates from map links and checks GSTINs', () => {
    expect(coordsFromMapLink('https://www.google.com/maps/place/X/@30.72261,76.75901,17z/data=!3d30.7226!4d76.759')).toEqual({ lat: 30.72261, lng: 76.75901 });
    expect(coordsFromMapLink('https://maps.google.com/?q=28.6139,77.2090')).toEqual({ lat: 28.6139, lng: 77.209 });
    expect(coordsFromMapLink('https://maps.app.goo.gl/abc')).toBeNull();
    expect(coordsFromMapLink('https://www.google.com/maps/@51.5,-0.12,10z')).toBeNull(); // outside India
    expect(gstinValid('04DJVPK1491Q1ZC')).toBe(true);
    expect(gstinValid('04DJVPK1491Q1ZD')).toBe(false);
    expect(gstinValid('99DJVPK1491Q1ZC')).toBe(false);
  });
});
