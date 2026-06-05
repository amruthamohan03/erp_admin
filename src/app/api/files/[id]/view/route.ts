// §4.11 — GET /api/files/:id/view. The MASKED view link: bytes are streamed
// through this route, so the browser only ever sees `/api/files/:id/view`, never
// the S3 bucket/key or a presigned URL. PDFs/images render inline.
//
// (This deliberately proxies bytes — §4.11 allows it "with a specific reason";
// here the reason is the explicit requirement to hide the object location.)
//
// TODO(perm): once src/lib/auth/permissions.ts ships checkPermission, also enforce
// checkPermission(user,'file','read') + visibility of the parent entity (§4.7).
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { files } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { s3Configured } from '@/lib/storage/s3';
import { getObject } from '@/lib/storage/objects';
import { LOCAL_BUCKET, readLocalObject } from '@/lib/storage/local';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: rawId } = await params;
  const fileId = Number(rawId);
  if (Number.isNaN(fileId)) return fail('Invalid file id', 400);

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return fail('File not found', 404);
  if (file.status !== 'committed') return fail('File is not available', 409);

  const headers = new Headers();
  headers.set('Content-Type', file.mime || 'application/octet-stream');
  // inline → render in-browser (PDF/image); filename is the field-based name.
  headers.set(
    'Content-Disposition',
    `inline; filename="${(file.originalName || 'file').replace(/"/g, '')}"`,
  );
  if (file.size) headers.set('Content-Length', String(file.size));
  // Private: never cache a permissioned object in shared caches.
  headers.set('Cache-Control', 'private, max-age=0, no-store');

  // Read from whichever backend the object lives in. Either way the browser only
  // ever sees this route URL — never the S3 key/bucket or the local disk path.
  if (file.bucket === LOCAL_BUCKET) {
    try {
      const buf = await readLocalObject(file.key);
      return new Response(new Uint8Array(buf), { status: 200, headers });
    } catch {
      return fail('Could not read file from local storage', 502);
    }
  }

  if (!s3Configured()) return fail('File storage is not configured (§4.11).', 503);
  try {
    const obj = await getObject(file.key);
    return new Response(obj.Body!.transformToWebStream(), { status: 200, headers });
  } catch {
    return fail('Could not read file from storage', 502);
  }
}
