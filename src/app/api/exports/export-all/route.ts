// GET /api/exports/export-all → Excel (.xlsx) download of the export list
// (summary view). Honours the same filters as the /export list
// (?client_id=&license_id=&type_of_goods=&transport_mode=&start_date=&end_date=&card=)
// so "Export All" exports exactly what the current view is scoped to. (Phase 2
// adds multi-sheet XLSX variants grouped by license / client.)
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exports,
  clients,
  licenses,
  transportModeMaster,
  clearingStatusMaster,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { cardCondition } from '@/lib/exports/cardConditions';

const filterSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  type_of_goods: z.coerce.number().int().positive().optional(),
  transport_mode: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  card: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const parsed = filterSchema.safeParse({
    client_id: searchParams.get('client_id') || undefined,
    license_id: searchParams.get('license_id') || undefined,
    type_of_goods: searchParams.get('type_of_goods') || undefined,
    transport_mode: searchParams.get('transport_mode') || undefined,
    start_date: searchParams.get('start_date') || undefined,
    end_date: searchParams.get('end_date') || undefined,
    card: searchParams.get('card') || undefined,
  });
  if (!parsed.success) return fail('Invalid filter', 422, { errors: parsed.error.flatten() });
  const f = parsed.data;

  const conditions: SQL[] = [eq(exports.display, 'Y')];
  if (f.client_id) conditions.push(eq(exports.clientId, f.client_id));
  if (f.license_id) conditions.push(eq(exports.licenseId, f.license_id));
  if (f.type_of_goods) conditions.push(eq(exports.typeOfGoods, f.type_of_goods));
  if (f.transport_mode) conditions.push(eq(exports.transportMode, f.transport_mode));
  if (f.start_date) conditions.push(gte(exports.loadingDate, f.start_date));
  if (f.end_date) conditions.push(lte(exports.loadingDate, f.end_date));
  if (f.card) {
    const cardCond = cardCondition(f.card);
    if (cardCond) conditions.push(cardCond);
  }

  const rows = await db
    .select({
      id: exports.id,
      mca_ref: exports.mcaRef,
      client_name: clients.shortName,
      license_number: licenses.licenseNumber,
      invoice: exports.invoice,
      transport_mode_name: transportModeMaster.transportModeName,
      loading_date: exports.loadingDate,
      weight: exports.weight,
      fob: exports.fob,
      clearing_status_name: clearingStatusMaster.clearingStatus,
    })
    .from(exports)
    .leftJoin(clients, eq(clients.id, exports.clientId))
    .leftJoin(licenses, eq(licenses.id, exports.licenseId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, exports.transportMode))
    .leftJoin(clearingStatusMaster, eq(clearingStatusMaster.id, exports.clearingStatus))
    .where(and(...conditions))
    .orderBy(desc(exports.id));

  const totalWeight = rows.reduce((a, r) => a + Number(r.weight ?? 0), 0);
  const totalFob = rows.reduce((a, r) => a + Number(r.fob ?? 0), 0);

  const buf = await buildXlsx([
    {
      name: 'Exports',
      columns: [
        { key: 'id', header: 'ID', width: 8 },
        { key: 'mca_ref', header: 'MCA Ref', width: 26 },
        { key: 'client_name', header: 'Client', width: 18 },
        { key: 'license_number', header: 'License Number', width: 22 },
        { key: 'invoice', header: 'Invoice', width: 16 },
        { key: 'transport_mode_name', header: 'Transport Mode', width: 16 },
        { key: 'loading_date', header: 'Loading Date', width: 14 },
        { key: 'weight', header: 'Weight (MT)', width: 14 },
        { key: 'fob', header: 'FOB', width: 14 },
        { key: 'clearing_status_name', header: 'Clearing Status', width: 18 },
      ],
      rows,
      totalsRow: {
        mca_ref: `TOTAL (${rows.length} records)`,
        weight: Number(totalWeight.toFixed(3)),
        fob: Number(totalFob.toFixed(2)),
      },
    },
  ]);

  const suffix = f.card && f.card !== 'all' ? `-${f.card}` : '';
  return xlsxResponse(buf, `exports-export-all${suffix}-${dateStamp()}.xlsx`);
}

