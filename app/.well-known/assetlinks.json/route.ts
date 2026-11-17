import { NextResponse } from 'next/server';

/**
 * Lets an Android app made from this site (a Trusted Web Activity) open full screen without a browser bar.
 * Set ANDROID_APP_PACKAGE and ANDROID_APP_SHA256 (the signing certificate fingerprint from Play Console).
 */
export function GET() {
  const pkg = process.env.ANDROID_APP_PACKAGE;
  const prints = (process.env.ANDROID_APP_SHA256 ?? '').split(',').map((s) => s.trim()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(s));
  if (!pkg || !prints.length) return NextResponse.json([]);
  return NextResponse.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints } }]);
}
