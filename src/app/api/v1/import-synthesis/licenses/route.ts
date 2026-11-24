import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_SYNTHESIS_RESOURCE, synthesisLicenseQuerySchema } from '@/schemas';
import { synthesisLicenses } from '@/db/queries/importSynthesis';

// GET /api/v1/import-synthesis/licenses?kind_id=&client_id= — the synthesis table.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_SYNTHESIS_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = synthesisLicenseQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await synthesisLicenses(q.kind_id, q.client_id));
});
