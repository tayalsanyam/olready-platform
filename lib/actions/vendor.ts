'use server';

import { pincodeInfo, saveVendorPlace } from '../locations';
import { STATE_CODES, gstinValid } from '../gst';
import { sql, DomainError, audit } from '../db';
import { requireProfile } from '../auth';
import { requireVendor } from '../vendorSession';
import { createVendor, updateVendorProfile, vendorForOwner } from '../vendors';
import { reportBooking, unlockNeed } from '../leads';
import { createOrder, type Gateway } from '../payments';
import { openDispute, replyToReview, submitProof } from '../reviews';
import { confirmTag } from '../realWeddings';
import { attempt, attrsFromForm, back, num, requireTerms, str } from './run';
import { LEGAL_VERSION } from '../legal';
import { filesFrom, storeImage } from '../storage';

export async function onboardVendor(fd: FormData) {
  await attempt('/vendor/onboard', async () => {
    const profile = await requireProfile('/vendor/onboard');
    if (await vendorForOwner(sql, profile.id)) return '/vendor';
    requireTerms(fd);
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from mkt.wedding_members where profile_id = ${profile.id}`;
    if (profile.role !== 'vendor' && (profile.role !== 'bride' || n > 0)) {
      throw new DomainError('wrong_account', 'Use a separate email for your business account');
    }
    await sql.begin(async (tx) => {
      await createVendor(
        tx,
        {
          business_name: str(fd, 'business_name'),
          category_id: num(fd, 'category_id') ?? 0,
          city_id: num(fd, 'city_id') ?? 0,
          tagline: str(fd, 'tagline'),
          starting_price_inr: num(fd, 'starting_price_inr'),
          phone: str(fd, 'phone') || null,
          instagram: str(fd, 'instagram') || null,
          attributes: attrsFromForm(fd),
        },
        { ownerProfileId: profile.id, actor: profile.id }
      );
      await tx`
        update mkt.profiles set role = 'vendor', full_name = coalesce(nullif(full_name, ''), ${str(fd, 'owner_name')}),
          terms_version = ${LEGAL_VERSION}, terms_accepted_at = now()
        where id = ${profile.id}`;
    });
    return { to: '/vendor/profile', ok: 'Profile created. Add photos and details; our team reviews it before it goes live.' };
  });
}

export async function saveVendorPlaceAction(fd: FormData) {
  await attempt('/vendor/profile#where', async () => {
    const { profile, vendor } = await requireVendor();
    await saveVendorPlace(
      sql,
      vendor.id,
      {
        cityId: num(fd, 'city_id'),
        localityId: num(fd, 'locality_id'),
        pincode: str(fd, 'pincode') || null,
        addressLine: str(fd, 'address_line'),
        mapsUrl: str(fd, 'maps_url'),
        addressPublic: fd.get('address_public') === 'on',
        serviceCityIds: fd.getAll('service_city_id').map(Number),
      },
      profile.id
    );
    return { ok: 'Address saved' };
  });
}

export async function saveVendorProfile(fd: FormData) {
  await attempt('/vendor/profile', async () => {
    const { profile, vendor } = await requireVendor();
    await sql`update mkt.profiles set notify_email = ${fd.get('notify_email') === 'on'} where id = ${profile.id}`;
    const wa = fd.get('whatsapp_alerts') === 'on';
    await sql`update mkt.vendors set whatsapp_alerts = ${wa}, whatsapp_alerts_at = case when ${wa} and not whatsapp_alerts then now() else whatsapp_alerts_at end where id = ${vendor.id}`;
    await updateVendorProfile(
      sql,
      vendor.id,
      {
        business_name: str(fd, 'business_name'),
        tagline: str(fd, 'tagline'),
        about: str(fd, 'about'),
        starting_price_inr: num(fd, 'starting_price_inr'),
        years_experience: num(fd, 'years_experience'),
        phone: str(fd, 'phone') || null,
        email: str(fd, 'email') || null,
        instagram: str(fd, 'instagram') || null,
        website: str(fd, 'website') || null,
        cover_image_url: str(fd, 'cover_image_url') || null,
        attributes: attrsFromForm(fd),
      },
      profile.id
    );
    return { ok: 'Saved' };
  });
}

export async function addMedia(fd: FormData) {
  await attempt('/vendor/profile', async () => {
    const { vendor } = await requireVendor();
    const files = filesFrom(fd, 'photos');
    const urls = str(fd, 'urls')
      .split(/\s+/)
      .filter((u) => /^https:\/\/\S+$/.test(u))
      .slice(0, 30);
    if (!files.length && !urls.length) throw new DomainError('no_photos', 'Choose photos to upload');
    for (const f of files) urls.push(await storeImage(f, 'vendors'));
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from mkt.vendor_media where vendor_id = ${vendor.id}`;
    let i = n;
    for (const url of urls) {
      await sql`insert into mkt.vendor_media (vendor_id, url, sort) values (${vendor.id}, ${url}, ${i++})`;
    }
    // The first photo becomes the cover until the vendor picks one.
    await sql`update mkt.vendors set cover_image_url = ${urls[0]} where id = ${vendor.id} and cover_image_url is null`;
    return { ok: `Added ${urls.length} photo${urls.length > 1 ? 's' : ''}` };
  });
}

export async function setCoverAction(fd: FormData) {
  await attempt('/vendor/profile', async () => {
    const { vendor } = await requireVendor();
    const [m] = await sql<{ url: string }[]>`select url from mkt.vendor_media where id = ${str(fd, 'media_id')} and vendor_id = ${vendor.id}`;
    if (!m) throw new DomainError('not_found', 'Photo not found');
    await sql`update mkt.vendors set cover_image_url = ${m.url}, updated_at = now() where id = ${vendor.id}`;
    return { ok: 'Cover photo updated' };
  });
}

export async function removeMedia(fd: FormData) {
  await attempt('/vendor/profile', async () => {
    const { vendor } = await requireVendor();
    await sql`delete from mkt.vendor_media where id = ${str(fd, 'media_id')} and vendor_id = ${vendor.id}`;
    return { ok: 'Photo removed' };
  });
}

export async function unlockAction(fd: FormData) {
  await attempt('/vendor', async () => {
    const { profile, vendor } = await requireVendor();
    const r = await unlockNeed(sql, str(fd, 'need_id'), vendor.id, profile.id);
    return { to: `/vendor/threads/${r.threadId}`, ok: `Unlocked for ${r.cost} credit${r.cost > 1 ? 's' : ''}. Say hello.` };
  });
}

export async function vendorReportBooking(fd: FormData) {
  const threadId = str(fd, 'thread_id');
  await attempt(`/vendor/threads/${threadId}`, async () => {
    const { profile, vendor } = await requireVendor();
    const [t] = await sql<{ lead_need_id: string }[]>`select lead_need_id from mkt.threads where id = ${threadId} and vendor_id = ${vendor.id}`;
    if (!t) throw new DomainError('not_found', 'Conversation not found');
    await reportBooking(sql, { needId: t.lead_need_id, vendorId: vendor.id, reporterProfileId: profile.id, side: 'vendor', amountInr: num(fd, 'amount_inr') });
    return { ok: 'Booking recorded. A bonus credit is in your balance.' };
  });
}

export async function buyPack(fd: FormData) {
  await attempt('/vendor/packs', async () => {
    const { profile, vendor } = await requireVendor('/vendor/packs');
    requireTerms(fd);
    const { order } = await createOrder(sql, {
      profileId: profile.id,
      vendorId: vendor.id,
      packId: num(fd, 'pack_id') ?? 0,
      gateway: str(fd, 'gateway') as Gateway,
      buyerGstin: str(fd, 'gstin') || null,
      coupon: str(fd, 'coupon') || null,
    });
    await sql`update mkt.orders set terms_version = ${LEGAL_VERSION} where id = ${order.id}`;
    return `/pay/${order.id}`;
  });
}

export async function saveBillingAction(fd: FormData) {
  await attempt('/vendor/packs', async () => {
    const { profile, vendor } = await requireVendor('/vendor/packs');
    const gstin = str(fd, 'gstin').replace(/\s/g, '').toUpperCase() || null;
    if (gstin && !gstinValid(gstin)) throw new DomainError('bad_gstin', 'That GSTIN does not look right. Check each character against your GST certificate.');
    const pin = str(fd, 'billing_pincode').replace(/\s/g, '') || null;
    const info = pin ? await pincodeInfo(sql, pin) : null;
    if (pin && !info) throw new DomainError('bad_pincode', `We could not find pincode ${pin}`);
    // The state on the invoice: the GST registration's state, else the billing pincode's.
    if (gstin && info && gstin.slice(0, 2) !== info.state_code) {
      throw new DomainError('state_mismatch', `This GSTIN is registered in ${STATE_CODES[gstin.slice(0, 2)]}, but pincode ${pin} is in ${info.state}. Use the address on your GST registration.`);
    }
    await sql`
      update mkt.vendors set legal_name = ${str(fd, 'legal_name').slice(0, 120) || null}, gstin = ${gstin},
        billing_address = ${str(fd, 'billing_address').slice(0, 300) || null}, billing_pincode = ${pin},
        billing_state_code = ${gstin ? gstin.slice(0, 2) : (info?.state_code ?? null)}
      where id = ${vendor.id}`;
    await audit(sql, profile.id, 'vendor.billing', 'vendor', vendor.id);
    return { ok: 'Billing details saved. They apply to invoices issued from now on.' };
  });
}

export async function replyReviewAction(fd: FormData) {
  await attempt('/vendor/reviews', async () => {
    const { vendor } = await requireVendor();
    await replyToReview(sql, str(fd, 'review_id'), vendor.id, str(fd, 'reply'));
    return { ok: 'Reply posted' };
  });
}

export async function disputeReviewAction(fd: FormData) {
  await attempt('/vendor/reviews', async () => {
    const { profile, vendor } = await requireVendor();
    await openDispute(sql, str(fd, 'review_id'), vendor.id, str(fd, 'reason'), profile.id);
    return { ok: 'Dispute sent. Our team will contact you within 48 hours.' };
  });
}

export async function submitProofAction(fd: FormData) {
  await attempt('/vendor/reviews', async () => {
    const { vendor } = await requireVendor();
    await submitProof(sql, str(fd, 'dispute_id'), vendor.id, str(fd, 'proof'));
    return { ok: 'Proof sent for review' };
  });
}

export async function confirmTagAction(fd: FormData) {
  await attempt(back(fd, '/vendor/weddings'), async () => {
    const { vendor } = await requireVendor();
    await confirmTag(sql, str(fd, 'real_wedding_id'), vendor.id);
    return { ok: 'Confirmed' };
  });
}
