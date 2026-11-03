import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// Share cards (1200 x 630) for WhatsApp, Facebook and X. One layout: a marigold strand along the
// top, the wordmark, a short label, the page's headline and up to three facts.

export const OG_SIZE = { width: 1200, height: 630 };
let logo: string | null = null;

export async function ogCard(o: { label: string; title: string; facts?: string[]; badge?: string }) {
  logo ??= `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public/brand/olready-wordmark-invoice.png'))).toString('base64')}`;
  const dots = Array.from({ length: 30 }, (_, i) => i);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#faf6f8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 24px', height: 54 }}>
          {dots.map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {Array.from({ length: i % 2 ? 2 : 3 }, (_, k) => (
                <div key={k} style={{ width: 16, height: 16, borderRadius: 8, background: ['#f6a609', '#f08c00', '#fbbf24'][(i + k) % 3], marginTop: k ? 1 : 0 }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 72px 56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src={logo} height={38} width={(38 * 1977) / 327} alt="" />
            {o.badge ? (
              <div style={{ display: 'flex', background: '#e8f5ee', color: '#1f7a4d', fontSize: 26, fontWeight: 700, padding: '8px 18px', borderRadius: 999 }}>{o.badge}</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', marginTop: 44, fontSize: 30, color: '#a60048', fontWeight: 600 }}>{o.label}</div>
          <div style={{ display: 'flex', marginTop: 10, fontSize: o.title.length > 48 ? 60 : 72, lineHeight: 1.05, fontWeight: 700, color: '#111014', letterSpacing: -1.5 }}>{o.title}</div>
          <div style={{ display: 'flex', flex: 1 }} />
          {o.facts?.length ? (
            <div style={{ display: 'flex', gap: 18 }}>
              {o.facts.slice(0, 3).map((f) => (
                <div key={f} style={{ display: 'flex', background: '#ffffff', border: '2px solid #e7e3e7', borderRadius: 999, padding: '12px 26px', fontSize: 30, color: '#111014' }}>
                  {f}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', height: 14, background: '#ed0064' }} />
      </div>
    ),
    OG_SIZE
  );
}
