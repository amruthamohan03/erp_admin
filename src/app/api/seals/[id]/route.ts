// Single seal master — detail / update / soft-delete (cascades display='N' to its
// individual seal numbers). total_seal is re-derived from total_amount. Audited.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNos, sealIndividualNumbers, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { computeTotalSeal } from '@/lib/seals/constants';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: sealNos.id,
      office_location_id: sealNos.officeLocationId,
      main_location_name: mainOfficeMaster.mainLocationName,
      sub_office_code: sealNos.subOfficeCode,
      purchase_date: sealNos.purchaseDate,
      total_amount: sealNos.totalAmount,
      total_seal: sealNos.totalSeal,
      display: sealNos.display,
      created_at: sealNos.createdAt,
      updated_at: sealNos.updatedAt,
    })
    .from(sealNos)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(eq(sealNos.id, id));

  if (!row) return fail('Seal not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  office_location_id: z.coerce.number().int().positive().optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sub_office_code: z.string().max(100).optional().nullable(),
  total_amount: z.coerce.number().positive().optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('Invalid JSON body', 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  const d = parsed.data;

  const patch: Record<string, unknown> = {};
  if (d.office_location_id !== undefined) patch.officeLocationId = d.office_location_id;
  if (d.purchase_date !== undefined) patch.purchaseDate = d.purchase_date;
  if (d.sub_office_code !== undefined) patch.subOfficeCode = d.sub_office_code;
  if (d.total_amount !== undefined) { patch.totalAmount = String(d.total_amount); patch.totalSeal = computeTotalSeal(d.total_amount); }
  if (d.display !== undefined) patch.display = d.display;
  if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sealNos)
      .set({ ...patch, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(sealNos.id, id))
      .returning({ id: sealNos.id });
    if (!row) return null;
    await recordAudit(tx, { actorId: session.uid, action: 'update', entityType: 'seal_master', entityId: String(id), after: patch });
    return row.id;
  });

  if (!updated) return fail('Not found', 404);
  return ok({ id: updated });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sealNos)
      .set({ display: 'N', updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(sealNos.id, id))
      .returning({ id: sealNos.id });
    if (!row) return null;
    await tx.update(sealIndividualNumbers).set({ display: 'N' }).where(eq(sealIndividualNumbers.sealMasterId, id));
    await recordAudit(tx, { actorId: session.uid, action: 'delete', entityType: 'seal_master', entityId: String(id), metadata: {} });
    return row.id;
  });

  if (!deleted) return fail('Not found', 404);
  return ok({ id: deleted });
}
