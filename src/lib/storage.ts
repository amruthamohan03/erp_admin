import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_ROOT = path.join(PUBLIC_DIR, 'uploads');

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export interface SavedFile {
  url: string;
  absolutePath: string;
  size: number;
  mime: string;
}

export interface SaveOptions {
  /** Bucket name under public/uploads (e.g. "avatars", "signatures"). */
  bucket: string;
  /** Per-user subfolder (typically user id). */
  ownerId: number;
  /** Max file size in bytes. */
  maxBytes?: number;
  /** Restrict accepted MIME types. Defaults to common image types. */
  allowedMime?: Set<string>;
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png': return '.png';
    case 'image/jpeg':
    case 'image/jpg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    default: return '';
  }
}

export async function saveUploadedImage(file: File, opts: SaveOptions): Promise<SavedFile> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const allowed = opts.allowedMime ?? ALLOWED_IMAGE_MIME;

  if (!allowed.has(file.type)) {
    throw new UploadError('Unsupported file type', 415);
  }
  if (file.size > maxBytes) {
    throw new UploadError(`File too large (max ${Math.round(maxBytes / 1024)} KB)`, 413);
  }

  const dir = path.join(UPLOADS_ROOT, opts.bucket, String(opts.ownerId));
  await fs.mkdir(dir, { recursive: true });

  const ext = extFromMime(file.type) || path.extname(file.name) || '';
  const hash = crypto.randomBytes(6).toString('hex');
  const name = `${Date.now()}-${hash}${ext}`;
  const absolutePath = path.join(dir, name);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absolutePath, buf);

  const url = `/uploads/${opts.bucket}/${opts.ownerId}/${name}`;
  return { url, absolutePath, size: file.size, mime: file.type };
}

export async function deleteUploadIfLocal(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  if (!publicUrl.startsWith('/uploads/')) return;
  const rel = publicUrl.replace(/^\//, '');
  const abs = path.join(PUBLIC_DIR, rel);
  // Defensive: ensure resolved path stays inside uploads root.
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(UPLOADS_ROOT)) return;
  try {
    await fs.unlink(resolved);
  } catch {
    // Ignore - file may already be gone.
  }
}

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'UploadError';
  }
}
