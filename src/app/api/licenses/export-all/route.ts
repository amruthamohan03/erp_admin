// GET /api/licenses/export-all → CSV download of the license list (summary view).
// Honours the same advanced filters + stat-card filter as the /license list
// (?client_id=&transport_mode_id=&start_date=&end_date=&card=) so "Export All"
// exports exactly what the current view is scoped to.
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
import { fail } from '@/lib/api';
import { toCsv, csvResponse, dateStamp } from '@/lib/csv';
import { cardCondition } from '@/lib/licenses/cardConditions';

const filterSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  transport_mode_id: z.coerce.number().int().positive().optional(),
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
    transport_mode_id: searchParams.get('transport_mode_id') || undefined,
    start_date: searchParams.get('start_date') || undefined,
    end_date: searchParams.get('end_date') || undefined,
    card: searchParams.get('card') || undefined,
  });
  if (!parsed.success) return fail('Invalid filter', 422, { errors: parsed.error.flatten() });
  const f = parsed.data;

  const conditions: SQL[] = [eq(licenses.display, 'Y')];
  if (f.client_id) conditions.push(eq(licenses.clientId, f.client_id));
  if (f.transport_mode_id) conditions.push(eq(licenses.transportModeId, f.transport_mode_id));
  if (f.start_date) conditions.push(gte(licenses.licenseAppliedDate, f.start_date));
  if (f.end_date) conditions.push(lte(licenses.licenseAppliedDate, f.end_date));
  if (f.card) {
    const cardCond = cardCondition(f.card);
    if (cardCond) conditions.push(cardCond);
  }

  const rows = await db
    .select({
      id: licenses.id,
      license_number: licenses.licenseNumber,
      client_name: clients.shortName,
      bank_name: banklistMaster.bankName,
      kind_name: kindMaster.kindName,
      transport_mode_name: transportModeMaster.transportModeName,
      invoice_number: licenses.invoiceNumber,
      license_applied_date: licenses.licenseAppliedDate,
      license_validation_date: licenses.licenseValidationDate,
      license_expiry_date: licenses.licenseExpiryDate,
      status: licenses.status,
    })
    .from(licenses)
    .leftJoin(clients, eq(clients.id, licenses.clientId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenses.bankId))
    .leftJoin(kindMaster, eq(kindMaster.id, licenses.kindId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, licenses.transportModeId))
    .where(and(...conditions))
    .orderBy(desc(licenses.id));

  const csv = toCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'license_number', header: 'License Number' },
    { key: 'client_name', header: 'Client' },
    { key: 'bank_name', header: 'Bank' },
    { key: 'kind_name', header: 'Kind' },
    { key: 'transport_mode_name', header: 'Transport Mode' },
    { key: 'invoice_number', header: 'Invoice Number' },
    { key: 'license_applied_date', header: 'Applied Date' },
    { key: 'license_validation_date', header: 'Validation Date' },
    { key: 'license_expiry_date', header: 'Expiry Date' },
    { key: 'status', header: 'Status' },
  ]);

  const suffix = f.card && f.card !== 'all' ? `-${f.card}` : '';
  return csvResponse(csv, `licenses-export-all${suffix}-${dateStamp()}.csv`);
}
