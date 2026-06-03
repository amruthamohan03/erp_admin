// List endpoint for the /license page. Returns joined display names (client
// code, bank, kind, transport mode) rather than raw FK ids. Mutations on a
// single license go through the §4.12 transactional-page API at
// /api/pages/license/[id].
//
// Optional advanced filters (?client_id=&transport_mode_id=&start_date=&end_date=)
// are applied server-side; the page does its own search + pagination client-side
// over the returned set (mirrors the /clients list UX).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  licenses,
  clients,
  banklistMaster,
  kindMaster,
  transportModeMaster,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const filterSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  transport_mode_id: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const parsed = filterSchema.safeParse({
    client_id: searchParams.get('client_id') || undefined,
    transport_mode_id: searchParams.get('transport_mode_id') || undefined,
    start_date: searchParams.get('start_date') || undefined,
    end_date: searchParams.get('end_date') || undefined,
  });
  if (!parsed.success) {
    return fail('Invalid filter', 422, { errors: parsed.error.flatten() });
  }
  const f = parsed.data;

  const conditions: SQL[] = [eq(licenses.display, 'Y')];
  if (f.client_id) conditions.push(eq(licenses.clientId, f.client_id));
  if (f.transport_mode_id) conditions.push(eq(licenses.transportModeId, f.transport_mode_id));
  if (f.start_date) conditions.push(gte(licenses.licenseAppliedDate, f.start_date));
  if (f.end_date) conditions.push(lte(licenses.licenseAppliedDate, f.end_date));

  const rows = await db
    .select({
      id: licenses.id,
      license_number: licenses.licenseNumber,
      client_id: licenses.clientId,
      client_name: clients.shortName,
      bank_name: banklistMaster.bankName,
      kind_name: kindMaster.kindName,
      transport_mode_id: licenses.transportModeId,
      transport_mode_name: transportModeMaster.transportModeName,
      invoice_number: licenses.invoiceNumber,
      license_applied_date: licenses.licenseAppliedDate,
      license_expiry_date: licenses.licenseExpiryDate,
      status: licenses.status,
      display: licenses.display,
    })
    .from(licenses)
    .leftJoin(clients, eq(clients.id, licenses.clientId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenses.bankId))
    .leftJoin(kindMaster, eq(kindMaster.id, licenses.kindId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, licenses.transportModeId))
    .where(and(...conditions))
    .orderBy(desc(licenses.id));

  return ok(rows);
}
