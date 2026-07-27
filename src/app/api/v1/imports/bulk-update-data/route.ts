// GET /api/v1/imports/bulk-update-data?status_filters=&client_id=&pre_alert_from=&pre_alert_to=
// Rows to bulk-edit for the active "pending" dashboard filters, plus the editable
// + read-only field lists the modal renders. Only pending filters contribute
// editable fields; clearing-status filters resolve to an empty field set.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { bulkUpdateData } from '@/db/queries/importBulk';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const filterKeys = (sp.get('status_filters') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const clientId = Number(sp.get('client_id'));
  const data = await bulkUpdateData(filterKeys, {
    client_id: Number.isInteger(clientId) && clientId > 0 ? clientId : undefined,
    pre_alert_from: sp.get('pre_alert_from') ?? undefined,
    pre_alert_to: sp.get('pre_alert_to') ?? undefined,
  });
  return ok(data);
});
