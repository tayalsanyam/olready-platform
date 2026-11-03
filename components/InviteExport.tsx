'use client';

import { useState } from 'react';
import type { InviteContent, InviteLayout, InviteTheme } from '@/lib/inviteDesign';

/**
 * Downloads an invite as a short video (for WhatsApp status) or an image, rendered in the
 * browser on a canvas from the same data as the card. Nothing is uploaded.
 */
export function InviteExport({ layout, theme, content, fileName }: { layout: InviteLayout; theme: InviteTheme; content: InviteContent; fileName: string }) {
  const [busy, setBusy] = useState<'' | 'video' | 'image'>('');
  const [msg, setMsg] = useState('');

  async function image() {
    setBusy('image');
    setMsg('');
    try {
      await fontsReady();
      const c = document.createElement('canvas');
      c.width = 1080;
      c.height = 1512;
      drawFrame(c.getContext('2d')!, c.width, c.height, layout, theme, content, 999);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (blob) save(blob, `${fileName}.png`);
    } finally {
      setBusy('');
    }
  }

  async function video() {
    if (typeof MediaRecorder === 'undefined') {
      setMsg('This browser cannot make videos. Try Chrome, or download the image instead.');
      return;
    }
    setBusy('video');
    setMsg('Making your video… keep this tab open (about 12 seconds).');
    try {
      await fontsReady();
      const c = document.createElement('canvas');
      c.width = 720;
      c.height = 1008;
      const ctx = c.getContext('2d')!;
      const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      const type = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 4_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((r) => (rec.onstop = () => r()));
      const length = lineCount(content) * 0.5 + 3.5;
      const start = performance.now();
      rec.start(250);
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = (performance.now() - start) / 1000;
          drawFrame(ctx, c.width, c.height, layout, theme, content, t);
          if (t < length) requestAnimationFrame(tick);
          else resolve();
        };
        tick();
      });
      rec.stop();
      await done;
      const mime = rec.mimeType || type || 'video/webm';
      save(new Blob(chunks, { type: mime }), `${fileName}.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
      setMsg(mime.includes('mp4') ? 'Video saved.' : 'Video saved as WebM. If WhatsApp will not take it, open this page in Safari or recent Chrome for MP4.');
    } catch {
      setMsg('The video could not be made in this browser. Download the image instead.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={video} disabled={!!busy} className="btn btn-ghost btn-sm">
          {busy === 'video' ? 'Making video…' : 'Download video'}
        </button>
        <button type="button" onClick={image} disabled={!!busy} className="btn btn-ghost btn-sm">
          {busy === 'image' ? 'Saving…' : 'Download image'}
        </button>
      </div>
      {msg ? (
        <p className="hint mt-2" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function fontsReady() {
  try {
    await Promise.all(['48px "Great Vibes"', '48px "Cormorant Garamond"', '600 48px "Cormorant Garamond"', '48px "DM Sans"'].map((f) => document.fonts.load(f)));
  } catch {
    /* fall back to system fonts */
  }
}

type Line = { text: string; font: string; size: number; color: string; gap: number; rule?: boolean; upper?: boolean };

function lines(content: InviteContent, theme: InviteTheme): Line[] {
  const serif = theme.font === 'sans' ? '"DM Sans", sans-serif' : '"Cormorant Garamond", Georgia, serif';
  const std = content.kind === 'save_the_date';
  const out: Line[] = [];
  if (content.opening) out.push({ text: content.opening, font: serif, size: 0.034, color: theme.accent, gap: 0 });
  if (std) out.push({ text: 'SAVE THE DATE', font: serif, size: 0.03, color: theme.ink, gap: 0.03, upper: true });
  out.push({ text: `${content.bride || 'Bride'} & ${content.groom || 'Groom'}`, font: '"Great Vibes", cursive', size: 0.1, color: theme.accent, gap: 0.03 });
  if (content.family) out.push({ text: content.family, font: serif, size: 0.026, color: theme.ink, gap: 0.01 });
  if (content.message && !std) out.push({ text: content.message, font: serif, size: 0.032, color: theme.ink, gap: 0.03 });
  if (content.dateLine) out.push({ text: content.dateLine, font: `600 ${serif}`, size: 0.04, color: theme.accent, gap: 0.035, rule: true });
  if (!std) for (const e of content.events.slice(0, 6)) out.push({ text: `${e.name} · ${e.when}${e.venue ? ` · ${e.venue}` : ''}`, font: serif, size: 0.027, color: theme.ink, gap: 0.012 });
  if (std) out.push({ text: 'INVITATION TO FOLLOW', font: serif, size: 0.024, color: theme.ink, gap: 0.04, upper: true });
  return out;
}
const lineCount = (c: InviteContent) => 4 + (c.kind === 'card' ? Math.min(c.events.length, 6) : 1);

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      rows.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) rows.push(cur);
  return rows;
}

export function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, layout: InviteLayout, theme: InviteTheme, content: InviteContent, t: number) {
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawOrnament(ctx, W, H, layout, theme.accent, Math.min(1, t / 0.6));
  const items = lines(content, theme);
  // Measure, then centre the block vertically.
  const laid = items.map((l) => {
    const px = Math.round(l.size * W);
    ctx.font = l.font.startsWith('600') ? `600 ${px}px ${l.font.slice(4)}` : `${px}px ${l.font}`;
    const rows = wrap(ctx, l.text, W * 0.76);
    return { ...l, px, rows, font: ctx.font, h: rows.length * px * 1.25 + l.gap * H };
  });
  const total = laid.reduce((a, l) => a + l.h, 0);
  let y = (H - total) / 2;
  laid.forEach((l, i) => {
    y += l.gap * H;
    const appear = 0.4 + i * 0.5;
    const a = Math.max(0, Math.min(1, (t - appear) / 0.8));
    ctx.globalAlpha = a;
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lift = (1 - a) * l.px * 0.5;
    if (l.rule) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = Math.max(1, W / 720);
      const w = Math.min(W * 0.7, ctx.measureText(l.rows[0]).width + l.px * 2);
      ctx.beginPath();
      ctx.moveTo((W - w) / 2, y - l.px * 0.25 + lift);
      ctx.lineTo((W + w) / 2, y - l.px * 0.25 + lift);
      ctx.moveTo((W - w) / 2, y + l.rows.length * l.px * 1.25 + lift);
      ctx.lineTo((W + w) / 2, y + l.rows.length * l.px * 1.25 + lift);
      ctx.stroke();
    }
    for (const r of l.rows) {
      ctx.fillText(r, W / 2, y + lift);
      y += l.px * 1.25;
    }
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawOrnament(ctx: CanvasRenderingContext2D, W: number, H: number, layout: InviteLayout, accent: string, a: number) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.scale(W / 100, H / 140);
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  const line = (w: number) => (ctx.lineWidth = w);
  switch (layout) {
    case 'classic':
      line(0.6);
      ctx.strokeRect(4, 4, 92, 132);
      line(0.25);
      ctx.strokeRect(6, 6, 88, 128);
      break;
    case 'arch':
      line(0.6);
      ctx.stroke(new Path2D('M8 134 V48 C8 30 22 22 34 18 C42 15 47 10 50 4 C53 10 58 15 66 18 C78 22 92 30 92 48 V134 Z'));
      line(0.25);
      ctx.stroke(new Path2D('M11 131 V49 C11 33 24 26 35 22 C43 19 47 15 50 10 C53 15 57 19 65 22 C76 26 89 33 89 49 V131 Z'));
      break;
    case 'floral':
      for (const [tx, ty, sx, sy] of [
        [0, 0, 1, 1],
        [100, 0, -1, 1],
        [0, 140, 1, -1],
        [100, 140, -1, -1],
      ]) {
        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(sx, sy);
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.globalAlpha = a * (0.85 - i * 0.12);
          ctx.translate(6 + i * 3.2, 6 + i * 1.2);
          ctx.rotate(((30 + i * 12) * Math.PI) / 180);
          ctx.beginPath();
          ctx.ellipse(0, 0, 2.6, 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(5, 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      line(0.2);
      ctx.strokeRect(7, 7, 86, 126);
      break;
    case 'mandala':
      ctx.globalAlpha = a * 0.16;
      line(0.4);
      for (let i = 0; i < 24; i++) {
        ctx.save();
        ctx.translate(50, 70);
        ctx.rotate((i * 15 * Math.PI) / 180);
        ctx.beginPath();
        ctx.ellipse(0, -34, 5, 19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      for (const r of [12, 24, 36, 48]) {
        ctx.beginPath();
        ctx.arc(50, 70, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'modern':
      ctx.fillRect(0, 0, 100, 3);
      ctx.fillRect(0, 137, 100, 3);
      break;
    case 'royal':
      line(1.2);
      ctx.strokeRect(3, 3, 94, 134);
      line(0.3);
      ctx.setLineDash([1.2, 1.2]);
      ctx.strokeRect(6, 6, 88, 128);
      ctx.setLineDash([]);
      for (const [x, y] of [
        [6, 6],
        [94, 6],
        [6, 134],
        [94, 134],
      ]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}
