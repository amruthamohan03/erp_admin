import { NextRequest } from 'next/server';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { applyPerRowEdits } from '@/lib/bulkUpdate';
import { bulkEditApplyRequestSchema } from '@/schemas/bulk-update';

// POST /api/v1/bulk-edit/apply
//
// Apply an array of per-row edits in one transaction. If any
// patch tries a column outside the entity's editableColumns
// whitelist, the whole batch rolls back — no partial state.
// Rows with an empty patch are silently skipped so the UI can
// post its full state without pre-filtering.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bulkEditApplyRequestSchema.parse(await req.json());
  const result = await applyPerRowEdits({
    entity: body.entity,
    edits: body.edits,
    actorUserId: session.uid,
  });
  return ok(result);
});
