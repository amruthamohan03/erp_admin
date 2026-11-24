import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apurementPendingQuerySchema, apurementSaveSchema } from '@/schemas';
import { listPendingFiles, saveApurementRows } from '@/db/queries/importApurement';

// GET  /api/v1/import-apurement/pending?client_id= — one client's files awaiting apurement
// POST /api/v1/import-apurement/pending — the grid's one Save, { rows: [...] }, all or nothing
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = apurementPendingQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listPendingFiles(q.client_id));
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'edit');
  if (isResponse(session)) return session;
  const body = apurementSaveSchema.parse(await req.json());
  return ok(await saveApurementRows(body.rows, session.uid));
});
