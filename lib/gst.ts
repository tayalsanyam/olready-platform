// GST arithmetic for prices that already include tax. Pure functions, all money in paise.

export const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};
// Union territories without a legislature charge UTGST in place of SGST.
const UT_WITHOUT_LEGISLATURE = new Set(['04', '26', '31', '35', '38']);

export function stateCode(name: string | null | undefined) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return Object.entries(STATE_CODES).find(([, s]) => s.toLowerCase() === n)?.[0] ?? null;
}

export const gstinState = (gstin: string | null | undefined) => (gstin && /^\d{2}/.test(gstin) && STATE_CODES[gstin.slice(0, 2)] ? gstin.slice(0, 2) : null);

/** Splits a tax-inclusive total. Intra-state: CGST + SGST (or UTGST); inter-state: IGST. */
export function splitInclusive(totalPaise: number, ratePct: number, sellerState: string, buyerState: string) {
  const taxable = Math.round((totalPaise * 100) / (100 + ratePct));
  const tax = totalPaise - taxable;
  if (sellerState === buyerState) {
    const cgst = Math.floor(tax / 2);
    return { taxable, cgst, sgst: tax - cgst, igst: 0, utgst: UT_WITHOUT_LEGISLATURE.has(sellerState) };
  }
  return { taxable, cgst: 0, sgst: 0, igst: tax, utgst: false };
}

/** Indian financial year for a date, like "26-27" for 1 April 2026 to 31 March 2027 (India time). */
export function financialYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600e3);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const three = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ');

/** Rupees in words, Indian style: "Rupees One Lakh Twenty Thousand and Fifty Paise Only". */
export function rupeesInWords(paise: number) {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  const parts: string[] = [];
  let n = r;
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(Math.floor(crore / 100)) + ' Hundred ' + two(crore % 100) : two(crore)} Crore`.replace(/\s+/g, ' ').trim());
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  const words = parts.join(' ') || 'Zero';
  return `Rupees ${words}${p ? ` and ${two(p)} Paise` : ''} Only`;
}

export const paiseText = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Format and check digit of a GSTIN (the 15th character is a base-36 checksum of the first 14). */
export function gstinValid(raw: string) {
  const g = raw.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g) || !STATE_CODES[g.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}
