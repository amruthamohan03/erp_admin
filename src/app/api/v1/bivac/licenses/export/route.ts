import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { bivacLicenseListQuerySchema } from '@/schemas';
import { BIVAC_RESOURCE, listBivacLicenses } from '@/db/queries/bivac';

// GET /api/v1/bivac/licenses/export?q=&client_id=
//
// The Bivac licence list as a spreadsheet, parsed with the SAME schema as the
// list so the file holds exactly the rows the grid was filtered to (§4.15),
// every page of them — plus what the licence's allotments have been given,
// which the grid has no room for.

const MONEY = '#,##0.00';
const WEIGHT = '#,##0.000';
const BALANCE_FILL = 'FF27AE60';

const columns: XlsxColumn[] = [
  { key: 'license_number', header: 'License Number', width: 20 },
  { key: 'ref_cod', header: 'CRF', width: 14 },
  { key: 'partielle_count', header: 'PARTIELLE Count', width: 12, align: 'center' },
  { key: 'client_name', header: 'Client', width: 12 },
  { key: 'currency_name', header: 'Currency', width: 10 },
  { key: 'type_of_goods_name', header: 'Type of Goods', width: 22 },
  { key: 'fob_declared', header: 'License FOB', width: 14, numFmt: MONEY },
  { key: 'freight', header: 'License Freight', width: 14, numFmt: MONEY },
  { key: 'insurance', header: 'License Insurance', width: 15, numFmt: MONEY },
  { key: 'other_costs', header: 'License Other Costs', width: 16, numFmt: MONEY },
  { key: 'weight', header: 'License Weight (KG)', width: 16, numFmt: WEIGHT },
  { key: 'allocated_weight', header: 'Total AV Weight (KG)', width: 17, numFmt: WEIGHT },
  { key: 'allocated_fob', header: 'Total AV FOB', width: 14, numFmt: MONEY },
  { key: 'used_weight', header: 'Used Weight (KG)', width: 15, numFmt: WEIGHT },
  { key: 'used_fob', header: 'Used FOB', width: 14, numFmt: MONEY },
  { key: 'balance_weight', header: 'Balance Weight (KG)', width: 17, numFmt: WEIGHT, headerFill: BALANCE_FILL },
  { key: 'balance_fob', header: 'Balance FOB', width: 14, numFmt: MONEY, headerFill: BALANCE_FILL },
];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'export');
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bivacLicenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
  });

  const licences = await listBivacLicenses(q.client_id, q.q);

  // §4.15 — the client CODE, matching the grid this file mirrors; the
  // PARTIELLE sheet carries the legal name.
  const rows = licences.map((l) => ({
    license_number: l.license_number ?? '',
    ref_cod: l.ref_cod ?? '',
    partielle_count: l.partielle_count,
    client_name: l.client_name ?? '',
    currency_name: l.currency_name ?? '',
    type_of_goods_name: l.type_of_goods_name ?? '',
    fob_declared: l.fob_declared,
    freight: l.freight,
    insurance: l.insurance,
    other_costs: l.other_costs,
    weight: l.weight,
    allocated_weight: l.total_allocated_weight,
    allocated_fob: l.total_allocated_fob,
    used_weight: l.total_used_weight,
    used_fob: l.total_used_fob,
    balance_weight: l.balance_weight,
    balance_fob: l.balance_fob,
  }));

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'bivac_license',
    entityId: 'list',
    module: 'bivac',
    after: { rows: rows.length, client_id: q.client_id ?? null, filter: q.q ?? null },
  });

  const buf = await buildXlsx([{ name: 'Licenses', columns, rows, borders: true }]);
  const res = xlsxResponse(buf, `bivac-licenses-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
