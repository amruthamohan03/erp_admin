// GET /api/v1/audit-log — the filtered, paginated trail.
//
// §4.28: viewing the log is its own permission, separate from exporting it. A
// role that may read an entity's data does not thereby get to read who touched
// every other record in the system.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { checkPermission } from '@/lib/auth/permissions';
import { listAudit, auditFilterOptions } from '@/db/queries/auditLog';
import { AUDIT_MENU, parseAuditQuery } from '@/schemas/audit-log';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AUDIT_MENU, 'viewAudit');
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = parseAuditQuery(searchParams);
  const { items, total } = await listAudit(q, q.page, q.pageSize);

  // The filter dropdowns are cheap DISTINCTs and change as the log grows, so
  // they ride along rather than forcing a second round trip on every page.
  const options = await auditFilterOptions();

  // The page renders the Export button from this rather than guessing — §4.28
  // keeps exporting the log a separate grant from reading it.
  const canExport = await checkPermission(session, AUDIT_MENU, 'exportAudit');

  return ok(items, {
    meta: { total, page: q.page, pageSize: q.pageSize, options, can_export_audit: canExport },
  });
});
