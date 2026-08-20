// GET /api/v1/recycle-bin — the resource catalogue with a count of what each is
// holding, so the index can show where deleted records actually are.
//
// Filtered by permission: a resource is only listed when the caller may at least
// restore from it (§4.14 — users see only the actions they hold).
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { deletedCounts } from '@/db/queries/softDelete';
import { checkPermission } from '@/lib/auth/permissions';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const all = await deletedCounts();
  const visible = await Promise.all(
    all.map(async (r) => {
      const [canRestore, canPermanentDelete] = await Promise.all([
        checkPermission(session, r.menu, 'restore'),
        checkPermission(session, r.menu, 'permanentDelete'),
      ]);
      return { ...r, can_restore: canRestore, can_permanent_delete: canPermanentDelete };
    }),
  );

  return ok(visible.filter((r) => r.can_restore || r.can_permanent_delete));
});
