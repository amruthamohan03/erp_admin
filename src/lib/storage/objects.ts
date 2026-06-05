// §4.11 — storage helpers. Route handlers call these; they never import the SDK
// directly. presign for upload/download, head/get/delete, and key construction.
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, S3_BUCKET } from './s3';

const PRESIGN_TTL_SECONDS = 300; // 5 min, per §4.11

/** Slug a user-supplied filename for safe use inside an object key. */
export function slugifyName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  return base.slice(0, 120) || 'file';
}

/**
 * Name an upload after its input field (preserving the original extension), e.g.
 * field 'id_nat_file' + 'scan 1.PDF' → 'id_nat_file.pdf'. Underscores are kept so
 * the stored name matches the column/field name exactly.
 */
export function fieldFileName(fieldName: string, originalName: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(originalName);
  const ext = m ? m[1].toLowerCase() : '';
  const base =
    (fieldName || 'file').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) ||
    'file';
  return ext ? `${base}.${ext}` : base;
}

/** Object key: {env}/{entity_type}/{entity_id}/{file_id}-{name}. `name` is the
 *  already-safe filename (see fieldFileName); the file_id prefix keeps re-uploads
 *  of the same field distinct. */
export function buildObjectKey(args: {
  entityType: string | null;
  entityId: string | null;
  fileId: number;
  name: string;
}): string {
  const env = process.env.S3_ENV || 'dev';
  const et = (args.entityType || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  const eid = (args.entityId || 'unassigned').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${env}/${et}/${eid}/${args.fileId}-${args.name}`;
}

/** Presigned PUT URL — the client uploads bytes directly to S3 with this. */
export function presignUpload(key: string, mime: string | null): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ...(mime ? { ContentType: mime } : {}) }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/** Presigned GET URL (short TTL). Prefer the masked /api/files/:id/view route
 *  for user-facing links; this is for when a direct URL is genuinely needed. */
export function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

export function headObject(key: string): Promise<HeadObjectCommandOutput> {
  return s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export function getObject(key: string): Promise<GetObjectCommandOutput> {
  return s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export function deleteObject(key: string): Promise<unknown> {
  return s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}
