import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { IMPORT_APUREMENT_RESOURCE, apuredListQuerySchema } from '@/schemas';
import { listApuredFiles } from '@/db/queries/importApurement';
import { apuredSheet } from '@/db/queries/importApurementExport';

// GET /api/v1/import-apurement/apured/export?client_id=&q= — the same filter as the list (§4.15).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'export');
  if (isResponse(session)) return session;
  const q = apuredListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const files = await listApuredFiles(q);
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'import_apurement',
    entityId: 'apured',
    module: 'import-apurement',
    after: { rows: files.length, client_id: q.client_id ?? null, filter: q.q ?? null },
  });
  const res = xlsxResponse(await buildXlsx([apuredSheet(files)]), `apurement-apured-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
