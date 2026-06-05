// §4.11 — the ONE S3 client. No other module instantiates S3Client; route
// handlers go through the helpers in ./index.ts. Configured from S3_* env vars
// (AWS S3 or any S3-compatible store: R2, MinIO).
import { S3Client } from '@aws-sdk/client-s3';

declare global {
  // eslint-disable-next-line no-var
  var _s3Client: S3Client | undefined;
}

function makeClient(): S3Client {
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

export const s3: S3Client = global._s3Client ?? makeClient();
if (process.env.NODE_ENV !== 'production') global._s3Client = s3;

export const S3_BUCKET = process.env.S3_BUCKET ?? '';

/** True only when enough env is present to actually talk to a bucket. */
export function s3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY,
  );
}
