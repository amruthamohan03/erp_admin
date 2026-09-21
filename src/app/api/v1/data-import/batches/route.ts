// GET /api/v1/data-import/batches      — the import history
// GET /api/v1/data-import/batches?id=7 — what became of each row of one import
import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { importBatchIdSchema } from '@/schemas';
import { batchRows, listBatches } from '@/db/queries/dataImport';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = new URL(req.url).searchParams.get('id');
  if (id) return ok(await batchRows(importBatchIdSchema.parse(id)));
  return ok(await listBatches());
});
