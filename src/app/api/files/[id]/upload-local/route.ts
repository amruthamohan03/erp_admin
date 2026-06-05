// §4.11 DEV/SINGLE-SERVER FALLBACK — PUT /api/files/:id/upload-local.
// Receives the raw file bytes and writes them under public/uploads (see
// src/lib/storage/local.ts for the §4.11 caveats), then commits + audits in one
// step. Disabled whenever S3 is configured. NOT for serverless/multi-instance.
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { files } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { s3Configured } from '@/lib/storage/s3';
import { LOCAL_BUCKET, writeLocalObject } from '@/lib/storage/local';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (mirror of /api/files limit)

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  // If S3 is configured, the local path must not be used.
  if (s3Configured()) return fail('Local upload is disabled — S3 is configured.', 400);

  const { id: rawId } = await params;
  const fileId = Number(rawId);
  if (Number.isNaN(fileId)) return fail('Invalid file id', 400);

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return fail('File not found', 404);
  if (file.bucket !== LOCAL_BUCKET) return fail('File is not a local-storage object', 400);
  if (file.status === 'committed') return ok({ id: file.id, status: 'committed' }); // idempotent

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return fail('Empty upload', 400);
  if (buf.length > MAX_SIZE_BYTES) return fail('File exceeds the 10 MB limit', 413);

  try {
    await writeLocalObject(file.key, buf);
  } catch {
    return fail('Could not write file to local storage', 500);
  }

  const sha256 = createHash('sha256').update(buf).digest('hex');

  await db.transaction(async (tx) => {
    await tx
      .update(files)
      .set({ status: 'committed', size: buf.length, sha256, updatedAt: sql`now()` as unknown as Date })
      .where(eq(files.id, fileId));

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'file',
      entityId: String(fileId),
      after: { key: file.key, mime: file.mime, size: buf.length, original_name: file.originalName, storage: 'local' },
      metadata: { entity_type: file.entityType, entity_id: file.entityId, storage: 'local' },
    });
  });

  return ok({ id: fileId, status: 'committed', size: buf.length });
}
