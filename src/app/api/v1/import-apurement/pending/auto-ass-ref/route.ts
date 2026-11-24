import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apurementAutoAssRefSchema } from '@/schemas';
import { autoFillAssRef } from '@/db/queries/importApurement';

// POST /api/v1/import-apurement/pending/auto-ass-ref { client_id } — save each
// pending file's Insurance Reference as its ASS REF where none is saved yet.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'edit');
  if (isResponse(session)) return session;
  const body = apurementAutoAssRefSchema.parse(await req.json());
  return ok(await autoFillAssRef(body.client_id, session.uid));
});
