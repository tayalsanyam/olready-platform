'use client';

import { useRef, useState } from 'react';

/**
 * File input that shrinks photos in the browser (long side 2000 px, JPEG) before the form
 * is sent, so phone photos fit the upload limit and pages load fast.
 */
export function PhotoInput({ name, multiple = false, label, maxSide = 2000 }: { name: string; multiple?: boolean; label: string; maxSide?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  async function shrink(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      // Not a readable image: send it as is and let the server explain.
      return file;
    }
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  async function onChange() {
    const el = input.current;
    if (!el?.files?.length) return setStatus('');
    const picked = Array.from(el.files).slice(0, multiple ? 8 : 1);
    setStatus('Preparing photos…');
    const dt = new DataTransfer();
    for (const f of picked) dt.items.add(await shrink(f));
    el.files = dt.files;
    const kb = Math.round(Array.from(dt.files).reduce((a, f) => a + f.size, 0) / 1024);
    setStatus(`${dt.files.length} photo${dt.files.length > 1 ? 's' : ''} ready (${kb} KB)`);
  }

  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        ref={input}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={onChange}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-ink)] file:px-3 file:py-2 file:text-white"
      />
      <span className="hint mt-1 block">{status || (multiple ? 'Up to 8 photos at a time.' : 'JPEG, PNG or WebP.')}</span>
    </label>
  );
}
