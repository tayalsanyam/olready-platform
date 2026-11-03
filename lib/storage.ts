import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from './db';

const BUCKET = process.env.STORAGE_BUCKET ?? 'olready-media';
const MAX_BYTES = 5 * 1024 * 1024;

type Kind = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/** Identifies the image by its first bytes, not by the name or type the browser claims. */
export function sniffImage(buf: Uint8Array): Kind | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export function storageConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Stores one image and returns its public URL. Uses Supabase Storage when configured;
 * in local development it falls back to public/uploads.
 */
export async function storeImage(file: File, folder: 'vendors' | 'real-weddings' | 'invites' | 'reviews'): Promise<string> {
  if (!file || file.size === 0) throw new DomainError('no_file', 'Choose a photo');
  if (file.size > MAX_BYTES) throw new DomainError('too_big', 'Each photo must be under 5 MB');
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new DomainError('bad_type', 'Photos must be JPEG, PNG or WebP');
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${kind.ext}`;

  if (storageConfigured()) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': kind.mime,
        'Cache-Control': '31536000',
        'x-upsert': 'false',
      },
      body: buf,
    });
    if (!res.ok) throw new DomainError('upload_failed', 'The photo could not be uploaded. Try again.');
    return `${base}/storage/v1/object/public/${BUCKET}/${key}`;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new DomainError('storage_off', 'Photo uploads are not set up yet');
  }
  const dest = path.join(process.cwd(), 'public', 'uploads', key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return `/uploads/${key}`;
}

/** A chat attachment: an image or a PDF up to 4 MB, checked by its bytes. */
export async function storeAttachment(file: File): Promise<{ url: string; kind: 'image' | 'pdf'; name: string }> {
  if (!file || file.size === 0) throw new DomainError('no_file', 'Choose a file');
  if (file.size > 4 * 1024 * 1024) throw new DomainError('too_big', 'Files must be under 4 MB');
  const buf = new Uint8Array(await file.arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d; // %PDF-
  const img = isPdf ? null : sniffImage(buf);
  if (!isPdf && !img) throw new DomainError('bad_type', 'Send a photo (JPEG, PNG, WebP) or a PDF');
  const ext = isPdf ? 'pdf' : img!.ext;
  const mime = isPdf ? 'application/pdf' : img!.mime;
  const name = (file.name || `file.${ext}`).replace(/[^\w.\- ]+/g, '').slice(0, 80) || `file.${ext}`;
  const key = `chat/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  if (storageConfigured()) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': mime,
        'x-upsert': 'false',
      },
      body: buf,
    });
    if (!res.ok) throw new DomainError('upload_failed', 'The file could not be uploaded. Try again.');
    return { url: `${base}/storage/v1/object/public/${BUCKET}/${key}`, kind: isPdf ? 'pdf' : 'image', name };
  }
  if (process.env.NODE_ENV === 'production') throw new DomainError('storage_off', 'File uploads are not set up yet');
  const dest = path.join(process.cwd(), 'public', 'uploads', key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { url: `/uploads/${key}`, kind: isPdf ? 'pdf' : 'image', name };
}

/** Reads every non-empty file under `name` from a form, capped at `max`. */
export function filesFrom(fd: FormData, name: string, max = 8) {
  const files = fd.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > max) throw new DomainError('too_many', `Upload up to ${max} photos at a time`);
  return files;
}
