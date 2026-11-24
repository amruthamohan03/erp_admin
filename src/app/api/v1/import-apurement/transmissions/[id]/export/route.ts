import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse } from '@/lib/xlsx';
import { IMPORT_APUREMENT_RESOURCE } from '@/schemas';
import { getTransmission, transmissionFiles } from '@/db/queries/importApurement';
import { transmissionSheet } from '@/db/queries/importApurementExport';
import { transmissionId } from '../route';

// GET /api/v1/import-apurement/transmissions/{id}/export — the transmission
// sheet that goes to the bank ("TRANSMIS POUR APUREMENT … N. … DU …").
export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'export');
  if (isResponse(session)) return session;
  const id = transmissionId((await params).id);
  const transmission = await getTransmission(id);
  if (!transmission) throw new NotFoundError(`Transmission #${id} was not found. It may have been deleted — reload the list.`);
  const files = await transmissionFiles([id]);

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'import_transmission',
    entityId: id,
    module: 'import-apurement',
    after: { transmission_reference: transmission.transmission_reference, rows: files.length },
  });

  const name = `${transmission.client_short ?? 'CLIENT'}_TRANSMIS_APUREMENT_${transmission.transmission_reference}.xlsx`
    .replace(/[^A-Za-z0-9._-]+/g, '-');
  const res = xlsxResponse(await buildXlsx([await transmissionSheet(transmission, files)]), name);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
