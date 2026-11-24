import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_SYNTHESIS_RESOURCE } from '@/schemas';
import { synthesisKinds } from '@/db/queries/importSynthesis';

// GET /api/v1/import-synthesis/kinds — one card per active kind, with its licence count (§4.29).
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requirePermission(IMPORT_SYNTHESIS_RESOURCE, 'view');
  if (isResponse(session)) return session;
  return ok(await synthesisKinds());
});
