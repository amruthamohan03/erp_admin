import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, transmissionCreateSchema, transmissionListQuerySchema } from '@/schemas';
import { createTransmission, listTransmissions } from '@/db/queries/importApurement';

// GET  /api/v1/import-apurement/transmissions?client_id=&ar=with|without&q=&page=&pageSize=
// POST /api/v1/import-apurement/transmissions — send a licence's ready files to the bank.
//      The reference is issued by the generator, never typed (§4.33).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = transmissionListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { items, total } = await listTransmissions(q, { limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'add');
  if (isResponse(session)) return session;
  const body = transmissionCreateSchema.parse(await req.json());
  return ok(await createTransmission(body, session.uid), 201);
});
