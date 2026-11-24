import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import { BIVAC_RESOURCE, getActivePartialName, listFilesForPartial } from '@/db/queries/bivac';

// GET /api/v1/bivac/partials/{id}/files/export
//
// The import and export files consuming one PARTIELLE, as a spreadsheet.

type Ctx = { params: Promise<{ id: string }> };

const MONEY = '#,##0.00';
const WEIGHT = '#,##0.000';

const columns: XlsxColumn[] = [
  { key: 'partial_name', header: 'PARTIELLE Name', width: 20 },
  { key: 'side', header: 'Side', width: 9 },
  { key: 'mca_ref', header: 'File Reference', width: 20 },
  { key: 'inspection_reports', header: 'Inspection Reports', width: 18 },
  { key: 'declaration_reference', header: 'Declaration Reference', width: 20 },
  { key: 'dgda_in_date', header: 'DGDA In Date', width: 13 },
  { key: 'liquidation_reference', header: 'Liquidation Reference', width: 20 },
  { key: 'liquidation_date', header: 'Liquidation Date', width: 14 },
  { key: 'quittance_reference', header: 'Quittance Reference', width: 20 },
  { key: 'quittance_date', header: 'Quittance Date', width: 14 },
  { key: 'weight', header: 'Weight (KG)', width: 14, numFmt: WEIGHT },
  { key: 'fob', header: 'FOB', width: 14, numFmt: MONEY },
];

const text = (v: string | null): string => v?.trim() || NO_VALUE;

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'export');
  if (isResponse(session)) return session;

  const raw = (await params).id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return fail(`"${raw}" is not a valid PARTIELLE id.`, 400);

  const name = await getActivePartialName(id);
  if (!name) return fail(`PARTIELLE #${id} was not found. It may have been deleted — reload the list.`, 404);

  const files = await listFilesForPartial(name);
  // §4.19 / §4.41 — cells people read: DD-MM-YYYY dates, N/A for empty text.
  const rows = files.map((f) => ({
    partial_name: name,
    side: f.side,
    mca_ref: text(f.mca_ref),
    inspection_reports: text(f.inspection_reports),
    declaration_reference: text(f.declaration_reference),
    dgda_in_date: formatDate(f.dgda_in_date),
    liquidation_reference: text(f.liquidation_reference),
    liquidation_date: formatDate(f.liquidation_date),
    quittance_reference: text(f.quittance_reference),
    quittance_date: formatDate(f.quittance_date),
    weight: f.weight,
    fob: f.fob,
  }));

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'bivac_partial_files',
    entityId: id,
    module: 'bivac',
    after: { rows: rows.length, partial_name: name },
  });

  const buf = await buildXlsx([{ name: 'Files', columns, rows, borders: true }]);
  const res = xlsxResponse(buf, `bivac-files-${name.replace(/[^A-Za-z0-9-]+/g, '-')}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
