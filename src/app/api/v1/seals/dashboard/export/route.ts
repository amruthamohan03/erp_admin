import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isResponse, requirePermission, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildSealDashboardExport } from '@/db/queries/sealDashboardExport';
import { sealDashboardExportSchema } from '@/schemas/seal-dashboard';

// GET /api/v1/seals/dashboard/export?scope=…
//
// The Seal Tracker dashboard's spreadsheets, built from the same query functions
// the screen renders, so a download cannot disagree with a card (§4.15).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/masters/seals/dashboard', 'export');
  if (isResponse(session)) return session;

  const q = sealDashboardExportSchema.parse({
    scope: new URL(req.url).searchParams.get('scope') ?? undefined,
  });

  const { sheets, filename } = await buildSealDashboardExport(q);

  // §4.28 — an export is logged.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'seal-dashboard',
    entityId: 'dashboard',
    after: { scope: q.scope, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })) },
  });
  const buf = await buildXlsx(sheets);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
