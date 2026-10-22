import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isResponse, requirePermission, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildFicheDashboardExport } from '@/db/queries/ficheDashboardExport';
import { ficheDashboardExportSchema } from '@/schemas/fiche-dashboard';

// GET /api/v1/fiches/dashboard/export?scope=…
//
// The Fiche de Calcul dashboard's spreadsheets, built from the same query
// functions the screen renders, so a download cannot disagree with a card (§4.15).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/fiches/dashboard', 'export');
  if (isResponse(session)) return session;

  const q = ficheDashboardExportSchema.parse({
    scope: new URL(req.url).searchParams.get('scope') ?? undefined,
  });

  const { sheets, filename } = await buildFicheDashboardExport(q);

  // §4.28 — an export is logged, as the fiche list's own export is.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'page:fiche',
    entityId: 'dashboard',
    after: { scope: q.scope, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })) },
  });

  const buf = await buildXlsx(sheets);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
