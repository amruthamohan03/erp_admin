// Local filesystem storage backend — bytes live under
// public/uploads/. Used for development and single-server deploys.
// CLAUDE.md §4.11 forbids this for serverless / multi-instance hosts
// because the filesystem isn't shared; swap the backend in
// src/lib/storage/index.ts for those targets.
//
// All paths are resolved under ROOT and rejected if they escape it,
// so an unsanitised key can't read arbitrary files.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const LOCAL_BUCKET = 'local';

const ROOT = path.join(process.cwd(), 'public', 'uploads');

/** Slug a user-supplied filename for safe use inside an object key. */
export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 120) || 'file';
}

/**
 * Folder under uploads/ for a given entity_type. Defaults to `misc`
 * for unattached files. Reserved characters are stripped so the key
 * stays filesystem-safe across OSes.
 */
export function folderForEntityType(entityType: string | null): string {
  const raw = entityType || 'misc';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_') || 'misc';
}

/**
 * Object key: `{entity-folder}/{entity-id}/{file-id}-{safe-name}`.
 * The file_id prefix means two uploads of the same field on the
 * same entity don't collide even if the original filename matches.
 */
export function buildLocalKey(args: {
  entityType: string | null;
  entityId: string | null;
  fileId: number;
  name: string;
}): string {
  const folder = folderForEntityType(args.entityType);
  const eid = (args.entityId || 'unassigned').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${folder}/${eid}/${args.fileId}-${args.name}`;
}

/**
 * Resolve a key under ROOT. Throws on any path that escapes the
 * uploads directory (`..` segments, absolute paths, etc).
 */
function resolveSafe(key: string): string {
  const p = path.join(ROOT, key);
  const rel = path.relative(ROOT, p);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid storage key');
  }
  return p;
}

export async function writeLocalObject(
  key: string,
  data: Buffer,
): Promise<void> {
  const p = resolveSafe(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function readLocalObject(key: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(key));
}

export async function deleteLocalObject(key: string): Promise<void> {
  try {
    await fs.unlink(resolveSafe(key));
  } catch (err) {
    // Already gone is fine — the registry is the source of truth and
    // a missing file just means the user-facing delete is now consistent.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function localObjectExists(key: string): Promise<boolean> {
  try {
    await fs.access(resolveSafe(key));
    return true;
  } catch {
    return false;
  }
}
