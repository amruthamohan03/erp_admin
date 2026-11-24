import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apuredListQuerySchema } from '@/schemas';
import { listApuredFiles } from '@/db/queries/importApurement';

// GET /api/v1/import-apurement/apured?client_id=&q= — files carried by a live transmission.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = apuredListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listApuredFiles(q));
});
