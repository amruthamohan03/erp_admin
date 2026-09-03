// GET /api/v1/exports/bulk-update-data?status_filters=&client_id=&transport_mode_id=&loading_from=&loading_to=
//
// Rows to bulk-edit for the active "pending" dashboard filters, plus the editable
// and read-only field lists the modal renders. Only pending filters contribute
// editable fields; the clearing-status cards describe a state rather than a
// missing value and resolve to an empty field set.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { bulkUpdateData } from '@/db/queries/exportBulk';

const positiveInt = (raw: string | null): number | undefined => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const filterKeys = (sp.get('status_filters') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const data = await bulkUpdateData(filterKeys, {
    client_id: positiveInt(sp.get('client_id')),
    transport_mode_id: positiveInt(sp.get('transport_mode_id')),
    loading_from: sp.get('loading_from') ?? undefined,
    loading_to: sp.get('loading_to') ?? undefined,
  });
  return ok(data);
});
