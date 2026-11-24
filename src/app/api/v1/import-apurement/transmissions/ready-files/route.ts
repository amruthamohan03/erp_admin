import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { IMPORT_APUREMENT_RESOURCE, transmissionReadyFilesQuerySchema } from '@/schemas';
import { licenceApurementSummary, readyFiles } from '@/db/queries/importApurement';

// GET /api/v1/import-apurement/transmissions/ready-files?license_id= — what a new
// transmission on this licence would carry, and the licence's used / remaining.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = transmissionReadyFilesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const [summary, files] = await Promise.all([licenceApurementSummary(q.license_id), readyFiles(q.license_id)]);
  if (!summary) throw new NotFoundError(`Licence #${q.license_id} was not found or has been deleted — pick it again.`);
  return ok({ summary, files });
});
