import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { applyBulkUpdate } from '@/lib/bulkUpdate';
import { bulkUpdateApplyRequestSchema } from '@/schemas/bulk-update';

// POST /api/v1/bulk-update/apply
// Execute the bulk update against the entity's whitelisted table. The
// lib wraps the UPDATE + audit row in one transaction; the audit row
// captures filter + patch + matched_count so the operation is fully
// reconstructable from audit_log_t alone.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bulkUpdateApplyRequestSchema.parse(await req.json());
  const result = await applyBulkUpdate({
    entity: body.entity,
    predicate: body.predicate,
    patch: body.patch,
    actorUserId: session.uid,
  });
  return ok(result);
});
