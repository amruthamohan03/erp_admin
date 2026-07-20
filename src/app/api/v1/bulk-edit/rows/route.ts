import { NextRequest } from 'next/server';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { loadBulkEditRows } from '@/lib/bulkUpdate';
import { bulkEditRowsRequestSchema } from '@/schemas/bulk-update';

// POST /api/v1/bulk-edit/rows
//
// Load rows matching a predicate for the per-row bulk-edit UI.
// POST (not GET) so the predicate body can be as rich as bulk-
// update's — nested all/any groups don't survive a URL query
// string cleanly. The endpoint doesn't mutate anything; naming
// it under /bulk-edit/rows makes the intent obvious.
//
// Returns the entity's editable_columns list too, so the UI can
// render one input per column per row without a second GET.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bulkEditRowsRequestSchema.parse(await req.json());
  const result = await loadBulkEditRows({
    entity: body.entity,
    predicate: body.predicate,
    page: body.page,
    pageSize: body.pageSize,
    displayColumns: body.displayColumns,
  });
  return ok(result);
});
