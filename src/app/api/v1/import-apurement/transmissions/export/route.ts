import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { IMPORT_APUREMENT_RESOURCE, transmissionListQuerySchema } from '@/schemas';
import { listTransmissions } from '@/db/queries/importApurement';
import { transmissionsSheet } from '@/db/queries/importApurementExport';

// GET /api/v1/import-apurement/transmissions/export?client_id=&ar=&q= — the list
// as filtered, every page of it (§4.15).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'export');
  if (isResponse(session)) return session;
  const q = transmissionListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { items } = await listTransmissions(q);
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'import_transmission',
    entityId: 'list',
    module: 'import-apurement',
    after: { rows: items.length, client_id: q.client_id ?? null, ar: q.ar ?? null, filter: q.q ?? null },
  });
  const res = xlsxResponse(await buildXlsx([transmissionsSheet(items)]), `apurement-transmissions-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
