import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, transmissionArSchema } from '@/schemas';
import { setTransmissionAr } from '@/db/queries/importApurement';
import { transmissionId } from '../route';

// PUT /api/v1/import-apurement/transmissions/{id}/ar { file_id } — attach the
// bank's acknowledgement of receipt (uploaded through /api/v1/files), or detach
// it with null. A transmission with one moves to the "with AR" card.
export const PUT = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'edit');
  if (isResponse(session)) return session;
  const id = transmissionId((await params).id);
  const body = transmissionArSchema.parse(await req.json());
  await setTransmissionAr(id, body.file_id, session.uid);
  return ok({ id, ar_file_id: body.file_id });
});
