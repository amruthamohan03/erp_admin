import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { filesT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { deleteObject } from '@/lib/files';

// GET /api/v1/files/{id}
// Metadata for a single file — no bytes. Use /view for the actual
// content stream.
//
// DELETE /api/v1/files/{id}
// Soft delete — flips status='deleted' AND removes bytes from the
// storage backend. The row stays for audit; subsequent /view calls
// return 404. A future "purge" job can hard-delete rows past a
// retention threshold.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
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
      .where(eq(filesT.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('File not found');
    return ok(row);
  },
);

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({ id: filesT.id, key: filesT.key, status: filesT.status })
      .from(filesT)
      .where(eq(filesT.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('File not found');
    if (row.status === 'deleted') return ok({ id: row.id });

    // Drop bytes first; if that fails we don't want to leave a
    // dangling row claiming the file is gone. Storage delete is
    // idempotent (ENOENT treated as success) so a re-run is safe.
    await deleteObject(row.key);

    await db
      .update(filesT)
      .set({
        status: 'deleted',
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(filesT.id, id));

    return ok({ id });
  },
);
