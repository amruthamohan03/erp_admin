// POST /api/v1/recycle-bin/{resource}/{id}/restore — put a soft-deleted row back.
//
// §4.27 — gated on `can_restore`, which is a separate grant from `can_delete`:
// undoing a withdrawal is its own decision.
import { NextRequest } from 'next/server';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ForbiddenError } from '@/lib/errors';
import { getSoftDeleteResource, restoreRow, SoftDeleteError } from '@/db/queries/softDelete';
import { checkPermission } from '@/lib/auth/permissions';

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const POST = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { resource: key, id: rawId } = await params;
  const resource = getSoftDeleteResource(key);
  if (!resource) throw new BadRequestError(`Unknown recycle-bin resource: ${key}`);

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid record id');

  if (!(await checkPermission(session, resource.menu, 'restore'))) {
    throw new ForbiddenError(`You do not have permission to restore ${resource.label}.`);
  }

  try {
    const restored = await restoreRow(key, resource, id, session.uid);
    return ok(restored);
  } catch (err) {
    if (err instanceof SoftDeleteError) return fail(err.message, err.status);
    throw err;
  }
});
