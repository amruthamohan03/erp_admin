// GET /api/v1/data-import/targets
// GET /api/v1/data-import/targets?target_key=clients  → that target's fields
//
// The modules the import dropdown offers (import_target_master_t) and, for one
// of them, the fields a file can fill — which for a transaction page ARE the
// page's own fields, so a field added to a form is importable at once.
import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getImportTarget, importTargetFields, listImportTargets, loadAliases } from '@/db/queries/dataImport';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const targetKey = new URL(req.url).searchParams.get('target_key');
  if (!targetKey) return ok(await listImportTargets());

  const target = await getImportTarget(targetKey);
  const [fields, aliases] = await Promise.all([importTargetFields(target), loadAliases(target.id)]);
  return ok({ target, fields, aliases });
});
