// Creator portfolio uploads, stored in Vercel Blob through its HTTP API (no SDK needed).
// Without BLOB_READ_WRITE_TOKEN nothing is uploaded and callers get { notConfigured: true }:
// an upload is never faked.
import { env } from './env';

export const UPLOAD_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 6;

const token = () => (env as any).BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
export const uploadsReady = () => Boolean(token());

export type UploadResult =
  | { ok: true; url: string; contentType: string; bytes: number }
  | { ok: false; notConfigured?: boolean; error: string };

/** Checks a file before anything is sent anywhere. Returns an error a person can act on, or null. */
export function checkUpload(file: { type?: string; size?: number } | null | undefined): string | null {
  if (!file || !file.size) return 'Choose an image to upload.';
  if (!UPLOAD_TYPES[String(file.type)]) return 'Upload a JPG, PNG or WebP image.';
  if (file.size > UPLOAD_MAX_BYTES) return 'That image is over 4 MB. Export a smaller version and try again.';
  return null;
}

/** Uploads one validated image to a random path under creators/<creatorId>/. */
export async function uploadCreatorImage(creatorId: string, file: File): Promise<UploadResult> {
  const problem = checkUpload(file);
  if (problem) return { ok: false, error: problem };
  if (!uploadsReady()) return { ok: false, notConfigured: true, error: "Uploads aren't switched on yet; add your best reels as links below." };
  const rand = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const safeId = String(creatorId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'creator';
  const pathname = `creators/${safeId}/${rand}.${UPLOAD_TYPES[file.type]}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    const r = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}`, 'x-content-type': file.type, 'x-add-random-suffix': '0' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.url) return { ok: false, error: `The upload service refused the file (${r.status}). Try again in a minute.` };
    return { ok: true, url: String(j.url), contentType: file.type, bytes: file.size };
  } catch (e: any) {
    return { ok: false, error: 'The upload did not finish. Check your connection and try again.' };
  }
}

/** Deletes a stored file. Never throws; returns false when the service did not confirm. */
export async function deleteBlob(url: string): Promise<boolean> {
  if (!uploadsReady() || !/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(url)) return false;
  try {
    const r = await fetch('https://blob.vercel-storage.com/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
