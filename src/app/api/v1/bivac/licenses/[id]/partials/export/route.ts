import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { BIVAC_RESOURCE, getBivacLicenseHeader } from '@/db/queries/bivac';
import { listForLicense } from '@/db/queries/partielle';

// GET /api/v1/bivac/licenses/{id}/partials/export
//
// One licence's PARTIELLE allotments with their usage, as a spreadsheet — the
// rows the drill-down shows. Each row repeats the licence's own figures so the
// sheet reads on its own once it has left the office.

type Ctx = { params: Promise<{ id: string }> };

const MONEY = '#,##0.00';
const WEIGHT = '#,##0.000';

const columns: XlsxColumn[] = [
  { key: 'partial_name', header: 'PARTIELLE Name', width: 22 },
  { key: 'license_number', header: 'License Number', width: 20 },
  { key: 'ref_cod', header: 'CRF', width: 14 },
  { key: 'client', header: 'Client', width: 28 },
  { key: 'license_weight', header: 'License Weight (KG)', width: 16, numFmt: WEIGHT },
  { key: 'license_fob', header: 'License FOB', width: 14, numFmt: MONEY },
  { key: 'partial_weight', header: 'AV Weight (KG)', width: 15, numFmt: WEIGHT },
  { key: 'partial_fob', header: 'AV FOB', width: 14, numFmt: MONEY },
  { key: 'weight_used', header: 'Used Weight (KG)', width: 15, numFmt: WEIGHT },
  { key: 'fob_used', header: 'Used FOB', width: 14, numFmt: MONEY },
  { key: 'remaining_weight', header: 'Remaining Weight (KG)', width: 18, numFmt: WEIGHT },
  { key: 'remaining_fob', header: 'Remaining FOB', width: 14, numFmt: MONEY },
  { key: 'no_of_files', header: 'Files', width: 10, align: 'center' },
];

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'export');
  if (isResponse(session)) return session;

  const { id } = await params;
  const licenseId = Number(id);
  if (!Number.isInteger(licenseId) || licenseId <= 0) return fail(`"${id}" is not a valid licence id.`, 400);

  const licence = await getBivacLicenseHeader(licenseId);
  if (!licence) return fail(`Licence #${licenseId} was not found. It may have been deleted — reload the list.`, 404);

  const partials = await listForLicense(licenseId);
  const rows = partials.map((p) => ({
    partial_name: p.partial_name,
    license_number: licence.license_number ?? '',
    ref_cod: licence.ref_cod ?? '',
    // §4.15 — an export cell leaves the office, so the legal entity.
    client: licence.client_company_name ?? '',
    license_weight: licence.weight,
    license_fob: licence.fob_declared,
    partial_weight: p.partial_weight,
    partial_fob: p.partial_fob,
    weight_used: p.weight_used,
    fob_used: p.fob_used,
    remaining_weight: p.remaining_weight,
    remaining_fob: p.remaining_fob,
    no_of_files: p.no_of_files,
  }));

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'partielle',
    entityId: licenseId,
    module: 'bivac',
    after: { rows: rows.length, license_number: licence.license_number },
  });

  const buf = await buildXlsx([{ name: 'PARTIELLE', columns, rows, borders: true }]);
  const ref = (licence.license_number ?? String(licenseId)).replace(/[^A-Za-z0-9-]+/g, '-');
  const res = xlsxResponse(buf, `bivac-partielle-${ref}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
