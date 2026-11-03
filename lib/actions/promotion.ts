'use server';

import { DomainError, sql } from '../db';
import { requireRole } from '../auth';
import { requireVendor } from '../vendorSession';
import { createWalletOrder, type Gateway } from '../payments';
import { adjustWallet, bookBanner, cancelBanner, createBoost, decideBanner, setBoostStatus, teamBanner } from '../promotion';
import { storeImage } from '../storage';
import { queueEmail } from '../email';
import { attempt, back, num, str } from './run';

export async function topUpWalletAction(fd: FormData) {
  await attempt('/vendor/promote', async () => {
    const { profile, vendor } = await requireVendor('/vendor/promote');
    const order = await createWalletOrder(sql, {
      profileId: profile.id,
      vendorId: vendor.id,
      amountInr: num(fd, 'amount') ?? 0,
      gateway: str(fd, 'gateway') as Gateway,
      buyerGstin: str(fd, 'gstin') || null,
    });
    return `/pay/${order.id}`;
  });
}

export async function createBoostAction(fd: FormData) {
  await attempt('/vendor/promote', async () => {
    const { profile, vendor } = await requireVendor('/vendor/promote');
    await createBoost(
      sql,
      vendor,
      {
        placements: fd.getAll('placements').map(String),
        cityIds: fd.getAll('city_ids').map(Number).filter(Boolean),
        dailyBudget: num(fd, 'daily_budget') ?? 0,
        startsOn: str(fd, 'starts_on'),
        endsOn: str(fd, 'ends_on') || null,
      },
      profile.id
    );
    return { ok: 'Boost is running' };
  });
}

export async function boostStatusAction(fd: FormData) {
  await attempt('/vendor/promote', async () => {
    const { profile, vendor } = await requireVendor('/vendor/promote');
    const s = str(fd, 'status');
    if (!['active', 'paused', 'ended'].includes(s)) throw new DomainError('bad', 'Unknown status');
    await setBoostStatus(sql, str(fd, 'boost_id'), s as 'active' | 'paused' | 'ended', { actor: profile.id, vendorId: vendor.id });
    return { ok: s === 'active' ? 'Boost resumed' : s === 'paused' ? 'Boost paused' : 'Boost ended' };
  });
}

export async function bookBannerAction(fd: FormData) {
  await attempt('/vendor/promote', async () => {
    const { profile, vendor } = await requireVendor('/vendor/promote');
    const f = fd.get('image');
    if (!(f instanceof File) || !f.size) throw new DomainError('image', 'Add a 16:9 image for the banner');
    const placement = str(fd, 'placement') === 'city' ? 'city' : 'home';
    // Check everything cheap before uploading the image.
    const imageUrl = await storeImage(f, 'vendors');
    await bookBanner(sql, vendor, { placement, cityId: num(fd, 'city_id'), month: str(fd, 'month'), headline: str(fd, 'headline'), imageUrl }, profile.id);
    return { ok: 'Banner booked and paid from your wallet. Our team reviews it within one working day.' };
  });
}

export async function cancelBannerAction(fd: FormData) {
  await attempt('/vendor/promote', async () => {
    const { profile, vendor } = await requireVendor('/vendor/promote');
    await cancelBanner(sql, str(fd, 'banner_id'), vendor.id, profile.id);
    return { ok: 'Banner cancelled; the full amount is back in your wallet' };
  });
}

// ---------------------------------------------------------------- Ops
export async function opsDecideBanner(fd: FormData) {
  await attempt(back(fd, '/ops/promotions'), async () => {
    const p = await requireRole(['ops', 'admin']);
    const approve = str(fd, 'approve') === '1';
    const vendorId = await decideBanner(sql, str(fd, 'banner_id'), approve, str(fd, 'reason'), p.id);
    if (vendorId) {
      const [v] = await sql<{ email: string | null; name: string }[]>`
        select coalesce(pr.email, v.email) as email, v.business_name as name from mkt.vendors v left join mkt.profiles pr on pr.id = v.owner_profile_id where v.id = ${vendorId}`;
      if (v?.email) {
        await queueEmail(sql, v.email, approve ? 'banner_approved' : 'banner_rejected', { name: v.name, reason: str(fd, 'reason') }, `banner:${str(fd, 'banner_id')}:${approve ? 'ok' : 'no'}`);
      }
    }
    return { ok: approve ? 'Banner approved' : 'Banner rejected and refunded' };
  });
}

export async function opsBoostStatus(fd: FormData) {
  await attempt(back(fd, '/ops/promotions'), async () => {
    const p = await requireRole(['ops', 'admin']);
    const s = str(fd, 'status') === 'active' ? 'active' : 'paused';
    await setBoostStatus(sql, str(fd, 'boost_id'), s, { actor: p.id, ops: true });
    return { ok: s === 'paused' ? 'Boost paused' : 'Boost resumed' };
  });
}

export async function opsAdjustWallet(fd: FormData) {
  await attempt(back(fd, '/ops/promotions'), async () => {
    const p = await requireRole(['admin']);
    await adjustWallet(sql, str(fd, 'vendor_id'), num(fd, 'delta') ?? 0, str(fd, 'note'), p.id);
    return { ok: 'Wallet adjusted' };
  });
}

export async function opsTeamBanner(fd: FormData) {
  await attempt(back(fd, '/ops/promotions'), async () => {
    const p = await requireRole(['ops', 'admin', 'content']);
    const f = fd.get('image');
    if (!(f instanceof File) || !f.size) throw new DomainError('image', 'Add an image');
    const placement = str(fd, 'placement') === 'city' ? 'city' : 'home';
    const imageUrl = await storeImage(f, 'vendors');
    await teamBanner(sql, { placement, cityId: num(fd, 'city_id'), month: str(fd, 'month'), headline: str(fd, 'headline'), imageUrl, linkUrl: str(fd, 'link_url'), vendorId: str(fd, 'vendor_id') || null }, p.id);
    return { ok: 'Banner placed' };
  });
}
