import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { previewBulkUpdate } from '@/lib/bulkUpdate';
import { bulkUpdatePreviewRequestSchema } from '@/schemas/bulk-update';

// POST /api/v1/bulk-update/preview
// Count rows that match the predicate WITHOUT writing. The UI hits this
// first so the operator sees the match count before committing to the
// update — same shape as Excel's "find and replace" preview.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bulkUpdatePreviewRequestSchema.parse(await req.json());
  const result = await previewBulkUpdate(body);
  return ok(result);
});
