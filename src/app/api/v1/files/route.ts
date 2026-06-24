import { NextRequest } from 'next/server';
import { and, count, desc, eq, ne, type SQL } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { filesT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { fileListQuerySchema } from '@/schemas';
import {
  activeBucket,
  buildStorageKey,
  putObject,
  slugifyName,
} from '@/lib/files';

// GET /api/v1/files?entity_type=&entity_id=&status=&page=&pageSize=
// Paginated list of uploaded files. Defaults exclude `deleted`
// status; pass ?status=deleted explicitly to see soft-deleted rows.
//
// Typical caller: a form rendering "attachments for this entity"
// passes entity_type + entity_id to get the list.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = fileListQuerySchema.parse({
    entity_type: searchParams.get('entity_type') ?? undefined,
    entity_id: searchParams.get('entity_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [];
  if (q.entity_type) conds.push(eq(filesT.entityType, q.entity_type));
  if (q.entity_id) conds.push(eq(filesT.entityId, q.entity_id));
  if (q.status) {
    conds.push(eq(filesT.status, q.status));
  } else {
    // Default — hide soft-deleted rows.
    conds.push(ne(filesT.status, 'deleted'));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(filesT)
    .where(where);

  const items = await db
    .select({
      id: filesT.id,
      bucket: filesT.bucket,
      key: filesT.key,
      mime: filesT.mime,
      size: filesT.size,
      sha256: filesT.sha256,
      original_name: filesT.originalName,
      uploader_id: filesT.uploaderId,
      entity_type: filesT.entityType,
      entity_id: filesT.entityId,
      status: filesT.status,
      created_at: filesT.createdAt,
      updated_at: filesT.updatedAt,
    })
    .from(filesT)
    .where(where)
    .orderBy(desc(filesT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

// POST /api/v1/files
// Multipart upload. Accepts a single `file` field plus optional
// `entity_type` + `entity_id` metadata fields. Writes the bytes to
// the storage backend and inserts the `files_t` row in one round-
// trip. Returns the saved row.
//
// Two-step (presigned PUT + commit) flow lives in main but is
// deferred here — the local backend writes synchronously so a
// single POST is the simpler ergonomic.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new BadRequestError('Missing file in multipart body');
  }

  const entityType = (form.get('entity_type') as string | null) ?? null;
  const entityId = (form.get('entity_id') as string | null) ?? null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const safeName = slugifyName(file.name);

  // Two-phase insert because the key embeds the row id — insert
  // first with a placeholder key, then update with the real key
  // and write the bytes. One transaction so a write failure rolls
  // back the row.
  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(filesT)
      .values({
        bucket: activeBucket(),
        key: 'pending',
        mime: file.type || null,
        size: bytes.length,
        sha256,
        originalName: file.name,
        uploaderId: session.uid,
        entityType,
        entityId,
        status: 'committed',
      })
      .returning({
        id: filesT.id,
      });

    const key = buildStorageKey({
      entityType,
      entityId,
      fileId: row.id,
      name: safeName,
    });

    await putObject(key, bytes);

    await tx
      .update(filesT)
      .set({ key })
      .where(eq(filesT.id, row.id));

    return { id: row.id, key };
  });

  return ok(
    {
      id: inserted.id,
      bucket: activeBucket(),
      key: inserted.key,
      mime: file.type || null,
      size: bytes.length,
      sha256,
      original_name: file.name,
      entity_type: entityType,
      entity_id: entityId,
      status: 'committed',
    },
    201,
  );
});
