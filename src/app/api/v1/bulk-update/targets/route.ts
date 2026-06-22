import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BULK_UPDATE_TARGETS } from '@/lib/bulkUpdate';

// GET /api/v1/bulk-update/targets
// Returns the static whitelist of (entity, table, columns) for the UI's
// dropdowns. Code-defined — admins can't grant themselves new bulk-update
// targets without a PR. The lib is the source of truth; this route just
// projects it.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const targets = Object.entries(BULK_UPDATE_TARGETS).map(([entity, t]) => ({
    entity,
    label: t.label,
    editable_columns: t.editableColumns,
    filter_columns: t.filterColumns,
  }));
  return ok(targets);
});
