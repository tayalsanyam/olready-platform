import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TaxDocument } from './invoices';
import { paiseText, rupeesInWords } from './gst';

// A4 tax invoice or credit note. The standard PDF fonts cannot draw ₹, so amounts read "Rs."
// as Indian invoices commonly do.

const INK = rgb(0.13, 0.11, 0.12);
const MUTED = rgb(0.42, 0.4, 0.41);
const LINE = rgb(0.87, 0.85, 0.86);
const PINK = rgb(0.84, 0.07, 0.42);
const TINT = rgb(0.98, 0.96, 0.97);

let logoBytes: Uint8Array | null = null;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

// Keep to characters the standard fonts can encode.
const safe = (s: string) => s.replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');

export async function invoicePdf(d: TaxDocument) {
  const pdf = await PDFDocument.create();
  const credit = d.kind === 'credit_note';
  const registered = Boolean(d.seller.gstin);
  const title = credit ? 'Credit note' : registered ? 'Tax invoice' : 'Invoice';
  pdf.setTitle(`${title} ${d.number}`);
  pdf.setAuthor(d.seller.name);
  pdf.setCreator('OLReady');
  const page: PDFPage = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const M = 48;
  let y = 841.89 - M;

  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: typeof INK; right?: boolean } = {}) => {
    const size = o.size ?? 9.5;
    const f = o.f ?? font;
    const str = safe(s);
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: o.right ? x - w : x, y: yy, size, font: f, color: o.color ?? INK });
  };
  const rule = (yy: number, color = LINE, thickness = 0.75) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color });

  // Header: wordmark and seller on the left, document title and number on the right.
  try {
    logoBytes ??= new Uint8Array(await readFile(path.join(process.cwd(), 'public/brand/olready-wordmark-invoice.png')));
    const logo = await pdf.embedPng(logoBytes);
    const h = 22;
    page.drawImage(logo, { x: M, y: y - h, width: (logo.width / logo.height) * h, height: h });
  } catch {
    text('OLReady', M, y - 18, { size: 18, f: bold });
  }
  text(title, W - M, y - 16, { size: 18, f: bold, color: credit ? PINK : INK, right: true });
  y -= 44;
  text(d.seller.name, M, y, { f: bold, size: 10 });
  text(`No. ${d.number}`, W - M, y, { f: bold, size: 10, right: true });
  y -= 13;
  const sellerLines = [...wrap(safe(d.seller.address), font, 9.5, 250), d.seller.gstin ? `GSTIN ${d.seller.gstin}` : 'Not registered for GST', `State: ${d.seller.state} (${d.seller.state_code})`];
  const metaLines = [
    `Date: ${d.issued_at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`,
    ...(credit && d.original_number ? [`Against invoice ${d.original_number}`] : []),
    `Order: ${d.order_id.slice(0, 8).toUpperCase()}`,
    `Place of supply: ${d.place_of_supply}`,
  ];
  for (let i = 0; i < Math.max(sellerLines.length, metaLines.length); i++) {
    if (sellerLines[i]) text(sellerLines[i], M, y, { color: MUTED });
    if (metaLines[i]) text(metaLines[i], W - M, y, { color: MUTED, right: true });
    y -= 12.5;
  }
  y -= 8;
  rule(y);
  y -= 20;

  // Bill to.
  text(credit ? 'Credit to' : 'Bill to', M, y, { size: 8.5, f: bold, color: MUTED });
  y -= 14;
  text(d.buyer.name, M, y, { f: bold, size: 10.5 });
  y -= 13;
  for (const l of [...(d.buyer.address ? wrap(safe(d.buyer.address), font, 9.5, 300) : []), d.buyer.gstin ? `GSTIN ${d.buyer.gstin}` : 'Unregistered', `State: ${d.buyer.state} (${d.buyer.state_code})`]) {
    text(l, M, y, { color: MUTED });
    y -= 12.5;
  }
  y -= 14;

  // Line table.
  const cols = { desc: M + 10, sac: 330, qty: 395, amt: W - M - 10 };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: TINT });
  text('Description', cols.desc, y, { size: 8.5, f: bold, color: MUTED });
  text('SAC', cols.sac, y, { size: 8.5, f: bold, color: MUTED });
  text('Qty', cols.qty, y, { size: 8.5, f: bold, color: MUTED });
  text('Taxable value (Rs.)', cols.amt, y, { size: 8.5, f: bold, color: MUTED, right: true });
  y -= 24;
  const descLines = wrap(safe(d.description), font, 9.5, 260);
  descLines.forEach((l, i) => text(l, cols.desc, y - i * 12.5));
  text(d.sac, cols.sac, y);
  text('1', cols.qty, y);
  text(paiseText(Number(d.taxable_paise)), cols.amt, y, { right: true });
  y -= descLines.length * 12.5 + 8;
  rule(y);
  y -= 18;

  // Totals, right aligned.
  const lx = 330;
  const row = (label: string, value: string, o: { b?: boolean; muted?: boolean } = {}) => {
    text(label, lx, y, { f: o.b ? bold : font, color: o.muted ? MUTED : INK, size: o.b ? 10.5 : 9.5 });
    text(value, cols.amt, y, { f: o.b ? bold : font, right: true, size: o.b ? 10.5 : 9.5 });
    y -= o.b ? 18 : 15;
  };
  const list = Number(d.list_paise);
  const discount = Number(d.discount_paise);
  if (discount > 0) {
    row('List price (incl. GST)', paiseText(list), { muted: true });
    row('Discount', `- ${paiseText(discount)}`, { muted: true });
  }
  row('Taxable value', paiseText(Number(d.taxable_paise)));
  const rate = Number(d.rate_pct);
  if (Number(d.igst_paise) > 0 || (Number(d.cgst_paise) === 0 && Number(d.sgst_paise) === 0 && d.seller.state_code !== d.buyer.state_code)) {
    row(`IGST @ ${rate}%`, paiseText(Number(d.igst_paise)));
  } else {
    row(`CGST @ ${rate / 2}%`, paiseText(Number(d.cgst_paise)));
    row(`${d.utgst ? 'UTGST' : 'SGST'} @ ${rate / 2}%`, paiseText(Number(d.sgst_paise)));
  }
  page.drawLine({ start: { x: lx, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.75, color: LINE });
  y -= 6;
  row(credit ? 'Total credited (Rs.)' : 'Total (Rs.)', paiseText(Number(d.total_paise)), { b: true });
  y -= 4;
  for (const l of wrap(rupeesInWords(Number(d.total_paise)), font, 9, W - 2 * M)) {
    text(l, M, y, { size: 9, color: MUTED });
    y -= 12;
  }
  y -= 18;
  rule(y);
  y -= 16;
  const notes = [
    credit ? 'This credit note reduces the value and the GST of the invoice above by the amounts shown.' : 'Prices include GST. Reverse charge: No.',
    'This is a computer-generated document and does not need a signature.',
    `Questions about this ${credit ? 'credit note' : 'invoice'}: ${process.env.SELLER_EMAIL ?? 'hello@olready.in'}`,
  ];
  for (const n of notes) {
    text(n, M, y, { size: 8.5, color: MUTED });
    y -= 12;
  }
  return pdf.save();
}
