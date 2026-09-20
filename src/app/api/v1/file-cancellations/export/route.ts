// GET /api/v1/file-cancellations/export?q=
//
// The cancelled-files list as a spreadsheet, filtered by the same search as the
// screen (§4.15). The Client cell carries the legal name — a sheet leaves the
// office — and dates are DD-MM-YYYY (§4.19).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { listCancelledFiles } from '@/db/queries/fileCancellation';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/tracking/file-cancellation', 'export');
  if (isResponse(session)) return session;

  const term = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const all = await listCancelledFiles();
  const rows = term
    ? all.filter((r) =>
        [r.kind_label, r.mca_ref, r.client_name, r.client_legal_name, r.license_number, r.reason,
          r.cancelled_date, formatDate(r.cancelled_date, ''), r.cancelled_by]
          .some((v) => (v ?? '').toLowerCase().includes(term)),
      )
    : all;

  const columns: XlsxColumn[] = [
    { key: 'kind', header: 'Tracking Type', width: 14 },
    { key: 'mca_ref', header: 'MCA Reference', width: 22 },
    { key: 'client', header: 'Client', width: 36 },
    { key: 'license_number', header: 'License Number', width: 20 },
    { key: 'weight', header: 'Weight (kg)', width: 14, align: 'right' },
    { key: 'fob', header: 'FOB', width: 14, align: 'right' },
    { key: 'reason', header: 'Cancellation Reason', width: 32 },
    { key: 'cancelled_date', header: 'Cancelled Date', width: 15 },
    { key: 'cancelled_by', header: 'Cancelled By', width: 22 },
  ];
  const sheetRows = rows.map((r) => ({
    kind: r.kind_label,
    mca_ref: r.mca_ref,
    client: r.client_legal_name ?? r.client_name ?? '',
    license_number: r.license_number ?? '',
    weight: r.weight,
    fob: r.fob ?? '',
    reason: r.reason ?? '',
    cancelled_date: formatDate(r.cancelled_date, ''),
    cancelled_by: r.cancelled_by ?? '',
  }));

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'file_cancellation',
    entityId: 'list',
    after: { rows: sheetRows.length, filter: term || null },
  });

  const buf = await buildXlsx([{ name: 'Cancelled Files', columns, rows: sheetRows, borders: true }]);
  const res = xlsxResponse(buf, `cancelled-files-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
