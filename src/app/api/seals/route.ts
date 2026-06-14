// Seal master list + create. List joins the office-location name and a live
// added-seals count, with optional ?location= and ?status= filters (status keeps
// masters that have at least one individual seal in that status). Create derives
// total_seal from total_amount server-side and audits (§4.10).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNos, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { computeTotalSeal, SEAL_STATUSES } from '@/lib/seals/constants';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const sp = new URL(req.url).searchParams;
  const conditions: SQL[] = [eq(sealNos.display, 'Y')];

  const loc = sp.get('location');
  if (loc && /^\d+$/.test(loc) && loc !== '0') conditions.push(eq(sealNos.officeLocationId, Number(loc)));

  const status = sp.get('status');
  if (status && (SEAL_STATUSES as readonly string[]).includes(status)) {
    conditions.push(sql`${sealNos.id} IN (SELECT seal_master_id FROM seal_individual_numbers_t WHERE status = ${status})`);
  }

  const rows = await db
    .select({
      id: sealNos.id,
      office_location_id: sealNos.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
      sub_office_code: sealNos.subOfficeCode,
      purchase_date: sealNos.purchaseDate,
      total_amount: sealNos.totalAmount,
      total_seal: sealNos.totalSeal,
      added_seals: sql<number>`cast((select count(*) from seal_individual_numbers_t sin where sin.seal_master_id = ${sealNos.id}) as int)`,
      display: sealNos.display,
    })
    .from(sealNos)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(and(...conditions))
    .orderBy(desc(sealNos.id));

  return ok(rows);
}

const createSchema = z.object({
  office_location_id: z.coerce.number().int().positive(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sub_office_code: z.string().max(100).optional().nullable(),
  total_amount: z.coerce.number().positive(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('Invalid JSON body', 400); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  const d = parsed.data;

  const values = {
    officeLocationId: d.office_location_id,
    purchaseDate: d.purchase_date,
    subOfficeCode: d.sub_office_code ?? null,
    totalAmount: String(d.total_amount),
    totalSeal: computeTotalSeal(d.total_amount),
    display: (d.display ?? 'Y') as 'Y' | 'N',
  };

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sealNos)
      .values({ ...values, createdBy: session.uid, updatedBy: session.uid })
      .returning({ id: sealNos.id });
    await recordAudit(tx, {
      actorId: session.uid, action: 'create', entityType: 'seal_master', entityId: String(row.id), after: values,
    });
    return row.id;
  });

  return ok({ id }, 201);
}
