// List endpoint for the /export page. Returns joined display names (client code,
// license number, clearing status) rather than raw FK ids. Mutations on a single
// export go through the §4.12 transactional-page API at /api/pages/export/[id].
//
// Optional advanced filters (?client_id=&license_id=&type_of_goods=
// &transport_mode=&start_date=&end_date=) are applied server-side; the page does
// its own search + pagination client-side over the returned set.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exports, clients, licenses, clearingStatusMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { cardCondition } from '@/lib/exports/cardConditions';

const filterSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  type_of_goods: z.coerce.number().int().positive().optional(),
  transport_mode: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Dashboard stat-card filter (e.g. 'completed', 'seal_pending'); 'all'/absent = no filter.
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
  if (!parsed.success) {
    return fail('Invalid filter', 422, { errors: parsed.error.flatten() });
  }
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
      client_id: exports.clientId,
      client_name: clients.shortName,
      license_number: licenses.licenseNumber,
      invoice: exports.invoice,
      loading_date: exports.loadingDate,
      weight: exports.weight,
      fob: exports.fob,
      clearing_status_id: exports.clearingStatus,
      clearing_status_name: clearingStatusMaster.clearingStatus,
      display: exports.display,
    })
    .from(exports)
    .leftJoin(clients, eq(clients.id, exports.clientId))
    .leftJoin(licenses, eq(licenses.id, exports.licenseId))
    .leftJoin(clearingStatusMaster, eq(clearingStatusMaster.id, exports.clearingStatus))
    .where(and(...conditions))
    .orderBy(desc(exports.id));

  return ok(rows);
}
