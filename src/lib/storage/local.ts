// DEV / SINGLE-SERVER FALLBACK ONLY — used when S3 is not configured.
//
// ⚠️ This writes user content to the local filesystem (public/uploads/...), which
// CLAUDE.md §4.11 forbids for real deployments: serverless / multi-instance hosts
// lose these files. It exists purely so uploads work before S3 credentials are
// set; `s3Configured()` returning true disables this path entirely.
// TODO(config): remove once S3_* env vars are configured in every environment.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const LOCAL_BUCKET = 'local';

const ROOT = path.join(process.cwd(), 'public', 'uploads');

/** Folder per entity: 'page:clients' → 'clients', 'page:license' → 'license'. */
export function folderForEntityType(entityType: string | null): string {
  const raw = (entityType || 'misc').replace(/^page:/, '');
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_') || 'misc';
}

/** Local key: {entity-folder}/{entity_id}/{file_id}-{name}. `name` is the
 *  already-safe field-based filename (see fieldFileName in ./objects). */
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

/** Resolve a key under ROOT, refusing any path that escapes the uploads dir. */
function resolveSafe(key: string): string {
  const p = path.join(ROOT, key);
  const rel = path.relative(ROOT, p);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid storage key');
  }
  return p;
}

export async function writeLocalObject(key: string, data: Buffer): Promise<void> {
  const p = resolveSafe(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function readLocalObject(key: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(key));
}
