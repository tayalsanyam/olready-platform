import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// RFC 6238 time-based one-time codes (30 seconds, 6 digits, SHA-1), as Google Authenticator,
// Authy and Microsoft Authenticator use.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret: string) {
  const clean = secret.replace(/[\s=-]/g, '').toUpperCase();
  let bits = '';
  for (const c of clean) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error('bad secret');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codeAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Returns the time step the code matched (one step either side allowed), or null. */
export function verifyCode(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1]) {
    const want = Buffer.from(codeAt(secret, s));
    if (timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string) {
  return `otpauth://totp/Olready%20Ops:${encodeURIComponent(account)}?secret=${secret}&issuer=Olready%20Ops&digits=6&period=30`;
}
