// §4.11 — POST /api/files/:id/commit. Called after the client finishes the
// direct-to-S3 PUT. Verifies the object exists, records its real size/mime/sha256,
// flips status pending → committed, and writes an audit row — all in one tx.
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { files } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { s3Configured } from '@/lib/storage/s3';
import { headObject, getObject } from '@/lib/storage/objects';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

// Skip the sha256 read for very large objects (it streams the whole object).
const SHA256_MAX_BYTES = 25 * 1024 * 1024;

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  if (!s3Configured()) return fail('File storage is not configured (§4.11).', 503);

  const { id: rawId } = await params;
  const fileId = Number(rawId);
  if (Number.isNaN(fileId)) return fail('Invalid file id', 400);

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return fail('File not found', 404);
  if (file.status === 'committed') return ok({ id: file.id, status: 'committed' }); // idempotent

  // Verify the object actually landed in S3.
  let size: number | null = file.size ?? null;
  let mime: string | null = file.mime ?? null;
  try {
    const head = await headObject(file.key);
    if (typeof head.ContentLength === 'number') size = head.ContentLength;
    if (head.ContentType) mime = head.ContentType;
  } catch {
    return fail('Uploaded object not found in storage — upload may have failed.', 409);
  }

  // sha256 (server-side, post-upload). Best-effort: null on failure / oversize.
  let sha256: string | null = null;
  if (size === null || size <= SHA256_MAX_BYTES) {
    try {
      const obj = await getObject(file.key);
      const bytes = await obj.Body!.transformToByteArray();
      sha256 = createHash('sha256').update(bytes).digest('hex');
    } catch {
      sha256 = null;
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(files)
      .set({ status: 'committed', size, mime, sha256, updatedAt: sql`now()` as unknown as Date })
      .where(eq(files.id, fileId));

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'file',
      entityId: String(fileId),
      after: { key: file.key, mime, size, original_name: file.originalName },
      metadata: { entity_type: file.entityType, entity_id: file.entityId },
    });
  });

  return ok({ id: fileId, status: 'committed', size, mime, sha256 });
}
