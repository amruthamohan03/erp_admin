// DELETE /api/v1/recycle-bin/{resource}/{id} — destroy a row for good.
//
// §4.27 — the ONLY path in the app that can lose data. Three things guard it:
// a `can_permanent_delete` grant that is never inherited from `can_delete`, a
// requirement that the row already be soft-deleted, and a `confirm` body echoing
// the record's own label so a mis-aimed request cannot succeed by accident. The
// UI asks twice on top of that.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ForbiddenError } from '@/lib/errors';
import {
  getSoftDeleteResource,
  permanentlyDeleteRow,
  SoftDeleteError,
} from '@/db/queries/softDelete';
import { checkPermission } from '@/lib/auth/permissions';

const bodySchema = z.object({
  // Must equal the record's label. Not a UI nicety: it makes "permanently delete
  // id 42" impossible to issue without having actually read which record 42 is.
  confirm: z.string().min(1, 'Type the record name to confirm permanent deletion'),
});

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { resource: key, id: rawId } = await params;
  const resource = getSoftDeleteResource(key);
  if (!resource) throw new BadRequestError(`Unknown recycle-bin resource: ${key}`);

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid record id');

  if (!(await checkPermission(session, resource.menu, 'permanentDelete'))) {
    throw new ForbiddenError(
      `You do not have permission to permanently delete ${resource.label}.`,
    );
  }

  let confirm: string;
  try {
    confirm = bodySchema.parse(await req.json()).confirm;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new BadRequestError('Type the record name to confirm permanent deletion');
    }
    throw err;
  }

  try {
    const removed = await permanentlyDeleteRow(key, resource, id, session.uid, confirm);
    return ok(removed);
  } catch (err) {
    if (err instanceof SoftDeleteError) return fail(err.message, err.status);
    throw err;
  }
});
