// §4.11 — POST /api/files: register a pending upload and hand back a presigned
// PUT URL. The client uploads bytes straight to S3, then calls
// POST /api/files/:id/commit. No bytes pass through this server.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { files } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { S3_BUCKET, s3Configured } from '@/lib/storage/s3';
import { buildObjectKey, presignUpload, fieldFileName } from '@/lib/storage/objects';
import { LOCAL_BUCKET, buildLocalKey } from '@/lib/storage/local';

// TODO(config): move max size + allowed mimes to master_file_policy per §4.11.
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const bodySchema = z.object({
  original_name: z.string().min(1).max(500),
  mime: z.string().min(1).max(255),
  size: z.coerce.number().int().nonnegative().max(MAX_SIZE_BYTES),
  entity_type: z.string().max(100).optional().nullable(),
  entity_id: z.string().max(100).optional().nullable(),
  // The input field's name — the stored file is named after it (§ file rename).
  field_name: z.string().max(100).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  // S3 when configured; otherwise the §4.11 dev/single-server local fallback.
  const useS3 = s3Configured();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  const d = parsed.data;

  if (!ALLOWED_MIME.has(d.mime)) {
    return fail(`File type not allowed: ${d.mime}`, 422);
  }

  // Name the stored file after its input field (preserving the extension), e.g.
  // 'id_nat_file.pdf'. This becomes both the object name and the recorded name,
  // so it's consistent in storage, the masked view, and the audit trail.
  const storedName = fieldFileName(d.field_name || d.original_name, d.original_name);

  // Insert pending row first so the serial id can seed the object key.
  const [row] = await db
    .insert(files)
    .values({
      bucket: useS3 ? S3_BUCKET : LOCAL_BUCKET,
      key: '', // set below once we know the id
      mime: d.mime,
      size: d.size,
      originalName: storedName,
      uploaderId: session.uid,
      entityType: d.entity_type ?? null,
      entityId: d.entity_id ?? null,
      status: 'pending',
    })
    .returning({ id: files.id });

  if (useS3) {
    const key = buildObjectKey({
      entityType: d.entity_type ?? null,
      entityId: d.entity_id ?? null,
      fileId: row.id,
      name: storedName,
    });
    await db.update(files).set({ key }).where(eq(files.id, row.id));
    const uploadUrl = await presignUpload(key, d.mime);
    // Client: PUT bytes to S3 `upload_url`, then POST /api/files/{id}/commit.
    return ok({ file_id: row.id, upload_url: uploadUrl, key, mode: 's3' }, 201);
  }

  // Local fallback: client PUTs bytes to our own endpoint, which writes to disk
  // and commits in one step (no separate /commit call).
  const key = buildLocalKey({
    entityType: d.entity_type ?? null,
    entityId: d.entity_id ?? null,
    fileId: row.id,
    name: storedName,
  });
  await db.update(files).set({ key }).where(eq(files.id, row.id));
  return ok(
    { file_id: row.id, upload_url: `/api/files/${row.id}/upload-local`, key, mode: 'local' },
    201,
  );
}
