import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { ErrorCode } from '@/lib/api';

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
  /**
   * What the field is called in the message the operator reads — "Favicon",
   * "Logo", "Signature". Defaults to "File" (§4.23: name the thing that failed).
   */
  label?: string;
}

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

// Reverse lookup for the case below where the browser declares nothing useful.
const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime] ?? '';
}

/**
 * What the file actually is, not what the browser claimed.
 *
 * `File.type` comes from the OS mapping and is routinely wrong or empty: a
 * `.ico` picked on Windows arrives as `image/vnd.microsoft.icon`, as
 * `image/x-icon`, or as `''` depending on the registry, and a file dragged from
 * some archives arrives as `application/octet-stream`. Trusting it alone is why
 * a perfectly good favicon was rejected as "Unsupported file type".
 *
 * So: the magic bytes win, because they are the only thing the uploader cannot
 * get wrong — that also closes the other direction, where a `.exe` renamed to
 * `.png` would otherwise land in a web-served folder. A declared type that says
 * something specific is next, so a real zip is still rejected as a zip. The
 * filename extension is the last resort, used only when the browser declared
 * nothing (`''`) or the catch-all `application/octet-stream` — which is exactly
 * the `.ico` case that was failing.
 */
const GENERIC_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function detectMime(head: Buffer, fileName: string, declared: string): string {
  const sniffed = sniffImageMime(head);
  if (sniffed) return sniffed;

  if (!GENERIC_MIME.has(declared)) return declared;

  const ext = path.extname(fileName).toLowerCase();
  return EXT_MIME[ext] ?? declared;
}

/** Magic-byte signatures for the formats this app stores. */
function sniffImageMime(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  // ICO and CUR share a header; byte 2 is the resource type (1 = icon).
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
  // SVG is text: skip a BOM/whitespace/XML prolog and look for the root tag.
  const text = b.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^<(\?xml|!--|!DOCTYPE svg|svg)\b/i.test(text)) return 'image/svg+xml';
  return null;
}

/** ".png, .jpg or .svg" — the accepted list, spelled the way a user sees it. */
function describeAllowed(allowed: Set<string>): string {
  const exts = [...new Set([...allowed].map((m) => MIME_EXT[m]).filter(Boolean))];
  if (exts.length === 0) return 'a supported image';
  if (exts.length === 1) return `a ${exts[0]} file`;
  return `${exts.slice(0, -1).join(', ')} or ${exts[exts.length - 1]}`;
}

function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export async function saveUploadedImage(file: File, opts: SaveOptions): Promise<SavedFile> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const allowed = opts.allowedMime ?? ALLOWED_IMAGE_MIME;
  const label = opts.label ?? 'File';

  // Size first: reading the bytes of a 40 MB file only to reject it is wasted
  // work, and "too large" is the answer either way.
  if (file.size > maxBytes) {
    throw new UploadError(
      `${label} is ${describeSize(file.size)} — the limit is ${describeSize(maxBytes)}. Choose a smaller file.`,
      413,
    );
  }
  if (file.size === 0) {
    throw new UploadError(`${label} is empty (0 bytes). Choose a different file.`, 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(buf, file.name, file.type);

  if (!allowed.has(mime)) {
    // Name what the file turned out to be, by extension where that reads better
    // than the MIME type. "this file is application/zip" beats "unsupported".
    const got = MIME_EXT[mime] || mime || 'an unrecognised format';
    throw new UploadError(
      `Unsupported file type: ${label} must be ${describeAllowed(allowed)} — this file is ${got}.`,
      415,
    );
  }

  const dir = path.join(UPLOADS_ROOT, opts.bucket, String(opts.ownerId));
  const ext = extFromMime(mime) || path.extname(file.name) || '';
  const hash = crypto.randomBytes(6).toString('hex');
  const name = `${Date.now()}-${hash}${ext}`;
  const absolutePath = path.join(dir, name);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, buf);
    // The URL is about to be committed to the database, so confirm the bytes
    // actually landed. A row pointing at a file that was never written renders
    // as a broken image with nothing in the logs to explain it.
    const written = await fs.stat(absolutePath);
    if (written.size !== buf.length) {
      throw new Error(`wrote ${written.size} of ${buf.length} bytes`);
    }
  } catch (err) {
    throw new UploadError(
      `${label} could not be saved to the server. ${(err as Error)?.message ?? ''}`.trim(),
      500,
    );
  }

  const url = `/uploads/${opts.bucket}/${opts.ownerId}/${name}`;
  return { url, absolutePath, size: buf.length, mime };
}

/**
 * Absolute path for a stored upload, or null if it escapes the uploads root.
 *
 * The one place that turns an untrusted path into a filesystem location. It is
 * shared by the existence check, the delete and the serving route so a traversal
 * (`../../.env`) is rejected identically by all three — three private copies of
 * this check is three chances for one of them to be subtly weaker.
 *
 * Takes either a stored public URL (`/uploads/branding/0/x.png`) or the path
 * segments from the serving route.
 */
export function resolveUploadPath(publicUrlOrSegments: string | string[]): string | null {
  const rel = Array.isArray(publicUrlOrSegments)
    ? publicUrlOrSegments.join('/')
    : publicUrlOrSegments.replace(/^\/?uploads\//, '');
  // A NUL byte truncates the path at the syscall boundary, so a name like
  // "a.png\0../../.env" would pass a string check and open a different file.
  if (rel.includes('\0')) return null;

  const resolved = path.resolve(UPLOADS_ROOT, rel);
  // path.relative is the reliable containment test: a plain startsWith would
  // also accept a sibling directory whose name merely begins with "uploads".
  const inside = path.relative(UPLOADS_ROOT, resolved);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return resolved;
}

/** Content type for a stored upload, from its extension. */
export function uploadMimeFor(filePath: string): string | null {
  return EXT_MIME[path.extname(filePath).toLowerCase()] ?? null;
}

/** True when a stored `/uploads/...` URL still has its file on disk. */
export async function uploadExists(publicUrl: string | null | undefined): Promise<boolean> {
  if (!publicUrl) return false;
  if (!publicUrl.startsWith('/uploads/')) return true; // external URL — not ours to judge
  const resolved = resolveUploadPath(publicUrl);
  if (!resolved) return false;
  try {
    const stat = await fs.stat(resolved);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export async function deleteUploadIfLocal(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  if (!publicUrl.startsWith('/uploads/')) return;
  const resolved = resolveUploadPath(publicUrl);
  if (!resolved) return;
  try {
    await fs.unlink(resolved);
  } catch {
    // Ignore - file may already be gone.
  }
}

// Extends AppError so withErrorHandler in @/lib/api maps it straight to the
// envelope — callers can throw it (or let saveUploadedImage throw it) and the
// wrapper handles status, code, and response shape.
export class UploadError extends AppError {
  constructor(message: string, status = 400) {
    const code: ErrorCode =
      status === 413 ? 'PAYLOAD_TOO_LARGE' :
      status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' :
      'BAD_REQUEST';
    super(message, status, code);
    this.name = 'UploadError';
  }
}
