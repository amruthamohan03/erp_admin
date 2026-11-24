import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { IMPORT_APUREMENT_RESOURCE } from '@/schemas';
import { deleteTransmission, getTransmission, transmissionFiles } from '@/db/queries/importApurement';

type Ctx = { params: Promise<{ id: string }> };

export function transmissionId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError(`"${raw}" is not a valid transmission id.`);
  return id;
}

// GET /api/v1/import-apurement/transmissions/{id} — the transmission and the files it carried.
export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const id = transmissionId((await params).id);
  const transmission = await getTransmission(id);
  if (!transmission) throw new NotFoundError(`Transmission #${id} was not found. It may have been deleted — reload the list.`);
  return ok({ transmission, files: await transmissionFiles([id]) });
});

// DELETE /api/v1/import-apurement/transmissions/{id} — §4.27 soft delete; its
// files go back to pending so they can be transmitted again.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'delete');
  if (isResponse(session)) return session;
  const id = transmissionId((await params).id);
  const deleted = await deleteTransmission(id, session.uid);
  return ok({ id, transmission_reference: deleted.transmission_reference, files: deleted.file_count });
});
