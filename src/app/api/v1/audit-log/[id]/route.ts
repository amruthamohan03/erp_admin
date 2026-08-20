// GET /api/v1/audit-log/{id} — one entry with its full before/after diff.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { getAuditEntry } from '@/db/queries/auditLog';
import { AUDIT_MENU } from '@/schemas/audit-log';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: Request, { params }: Ctx) => {
  const session = await requirePermission(AUDIT_MENU, 'viewAudit');
  if (isResponse(session)) return session;

  const { id } = await params;
  const entry = await getAuditEntry(id);
  if (!entry) throw new NotFoundError('That audit entry no longer exists.');
  return ok(entry);
});
