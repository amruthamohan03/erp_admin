// §2 step 3 — GET /api/v1/fiches/export?q=&state=: the fiche list as a
// spreadsheet, with the SAME filter as the screen (§4.15). The Client cell is
// the legal name — a sheet leaves the office — and dates are DD-MM-YYYY (§4.19).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { ficheListQuerySchema } from '@/schemas';
import { exportFiches } from '@/db/queries/fiches';

const title = (s: string | null): string =>
  String(s ?? '').replace(/_/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/fiches', 'export');
  if (isResponse(session)) return session;
  const q = ficheListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await exportFiches(q.q, q.state);

  const columns: XlsxColumn[] = [
    { key: 'fiche_reference', header: 'Fiche Reference', width: 28 },
    { key: 'client', header: 'Client', width: 36 },
    { key: 'license_number', header: 'License Number', width: 20 },
    { key: 'mca_ref', header: 'MCA Reference', width: 22 },
    { key: 'fiche_date', header: 'Fiche Date', width: 13 },
    { key: 'poids', header: 'Weight (kg)', width: 14, align: 'right' },
    { key: 'cif', header: 'CIF', width: 16, align: 'right' },
    { key: 'total_ddi', header: 'DDI (FC)', width: 18, align: 'right' },
    { key: 'state', header: 'Status', width: 14 },
  ];
  const sheetRows = rows.map((r) => ({
    fiche_reference: r.fiche_reference ?? '',
    client: r.client_legal_name ?? r.client_name ?? '',
    license_number: r.license_number ?? '',
    mca_ref: r.mca_ref ?? '',
    fiche_date: formatDate(r.fiche_date, ''),
    poids: r.poids,
    cif: r.cif,
    total_ddi: r.total_ddi,
    state: title(r.state),
  }));

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'page:fiche',
    entityId: 'list',
    after: { rows: sheetRows.length, q: q.q ?? null, state: q.state ?? null },
  });

  const buf = await buildXlsx([{ name: 'Fiches de Calcul', columns, rows: sheetRows, borders: true }]);
  const res = xlsxResponse(buf, `fiches-de-calcul-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
