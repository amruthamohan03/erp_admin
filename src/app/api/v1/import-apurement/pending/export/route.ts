import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { IMPORT_APUREMENT_RESOURCE, apurementClientQuerySchema } from '@/schemas';
import { listPendingFiles } from '@/db/queries/importApurement';
import { pendingSheet } from '@/db/queries/importApurementExport';

// GET /api/v1/import-apurement/pending/export?client_id= — the files awaiting
// apurement, for one client or (from the dashboard card) for every client.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'export');
  if (isResponse(session)) return session;
  const q = apurementClientQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const files = await listPendingFiles(q.client_id);
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'import_apurement',
    entityId: 'pending',
    module: 'import-apurement',
    after: { rows: files.length, client_id: q.client_id ?? null },
  });
  const res = xlsxResponse(await buildXlsx([pendingSheet(files)]), `apurement-pending-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
