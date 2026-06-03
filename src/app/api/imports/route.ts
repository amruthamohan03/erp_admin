// List endpoint for the /import page. Returns joined display names (client code,
// license number, clearing status) rather than raw FK ids. Mutations on a single
// import go through the §4.12 transactional-page API at /api/pages/import/[id].
//
// Optional advanced filters (?client_id=&type_of_goods=&entry_point_id=
// &transport_mode=&start_date=&end_date=) are applied server-side; the page does
// its own search + pagination client-side over the returned set.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { imports, clients, licenses, clearingStatusMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { cardCondition } from '@/lib/imports/cardConditions';

const filterSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  type_of_goods: z.coerce.number().int().positive().optional(),
  entry_point_id: z.coerce.number().int().positive().optional(),
  transport_mode: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Dashboard stat-card filter (e.g. 'completed', 'crf_missing'); 'all'/absent = no filter.
  card: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const parsed = filterSchema.safeParse({
    client_id: searchParams.get('client_id') || undefined,
    type_of_goods: searchParams.get('type_of_goods') || undefined,
    entry_point_id: searchParams.get('entry_point_id') || undefined,
    transport_mode: searchParams.get('transport_mode') || undefined,
    start_date: searchParams.get('start_date') || undefined,
    end_date: searchParams.get('end_date') || undefined,
    card: searchParams.get('card') || undefined,
  });
  if (!parsed.success) {
    return fail('Invalid filter', 422, { errors: parsed.error.flatten() });
  }
  const f = parsed.data;

  const conditions: SQL[] = [eq(imports.display, 'Y')];
  if (f.client_id) conditions.push(eq(imports.clientId, f.client_id));
  if (f.type_of_goods) conditions.push(eq(imports.typeOfGoods, f.type_of_goods));
  if (f.entry_point_id) conditions.push(eq(imports.entryPointId, f.entry_point_id));
  if (f.transport_mode) conditions.push(eq(imports.transportMode, f.transport_mode));
  if (f.start_date) conditions.push(gte(imports.preAlertDate, f.start_date));
  if (f.end_date) conditions.push(lte(imports.preAlertDate, f.end_date));
  if (f.card) {
    const cardCond = cardCondition(f.card);
    if (cardCond) conditions.push(cardCond);
  }

  const rows = await db
    .select({
      id: imports.id,
      mca_ref: imports.mcaRef,
      client_id: imports.clientId,
      client_name: clients.shortName,
      license_number: licenses.licenseNumber,
      invoice: imports.invoice,
      pre_alert_date: imports.preAlertDate,
      weight: imports.weight,
      fob: imports.fob,
      clearing_status_id: imports.clearingStatus,
      clearing_status_name: clearingStatusMaster.clearingStatus,
      display: imports.display,
    })
    .from(imports)
    .leftJoin(clients, eq(clients.id, imports.clientId))
    .leftJoin(licenses, eq(licenses.id, imports.licenseId))
    .leftJoin(clearingStatusMaster, eq(clearingStatusMaster.id, imports.clearingStatus))
    .where(and(...conditions))
    .orderBy(desc(imports.id));

  return ok(rows);
}
