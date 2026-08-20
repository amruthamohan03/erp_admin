// GET /api/v1/audit-log/stats — every KPI on the audit dashboard.
//
// §4.29: computed in SQL over live rows, and over the SAME filters as the list,
// so the cards describe what the operator is looking at rather than the table as
// a whole.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { auditStats } from '@/db/queries/auditLog';
import { AUDIT_MENU, parseAuditQuery } from '@/schemas/audit-log';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AUDIT_MENU, 'viewAudit');
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  return ok(await auditStats(parseAuditQuery(searchParams)));
});
