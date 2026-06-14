// Single seal number — detail / update / delete. Update enforces the legacy rule:
// a seal already 'Used' can never be flipped to 'Damaged', and seal_number stays
// globally unique. Delete is a hard delete (frees the number for reuse), mirroring
// the source. Audited.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers, sealNos, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { recordAudit } from '@/lib/audit/recordAudit';
import { SEAL_STATUSES } from '@/lib/seals/constants';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: sealIndividualNumbers.id,
      seal_number: sealIndividualNumbers.sealNumber,
      status: sealIndividualNumbers.status,
      notes: sealIndividualNumbers.notes,
      seal_master_id: sealIndividualNumbers.sealMasterId,
      location: mainOfficeMaster.mainLocationName,
    })
    .from(sealIndividualNumbers)
    .leftJoin(sealNos, eq(sealNos.id, sealIndividualNumbers.sealMasterId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(eq(sealIndividualNumbers.id, id));

  if (!row) return fail('Seal number not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  seal_number: z.string().min(1).max(100).optional(),
  status: z.enum(SEAL_STATUSES).optional(),
  notes: z.string().max(2000).optional().nullable(),
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

  const [current] = await db
    .select({ status: sealIndividualNumbers.status })
    .from(sealIndividualNumbers)
    .where(eq(sealIndividualNumbers.id, id));
  if (!current) return fail('Seal number not found', 404);

  if (current.status === 'Used' && d.status === 'Damaged') {
    return fail('Cannot change status from "Used" to "Damaged".', 422);
  }

  if (d.seal_number) {
    const dup = await db
      .select({ id: sealIndividualNumbers.id })
      .from(sealIndividualNumbers)
      .where(and(eq(sealIndividualNumbers.sealNumber, d.seal_number), ne(sealIndividualNumbers.id, id)))
      .limit(1);
    if (dup.length > 0) return fail('This seal number already exists', 422);
  }

  const patch: Record<string, unknown> = {};
  if (d.seal_number !== undefined) patch.sealNumber = d.seal_number;
  if (d.status !== undefined) patch.status = d.status;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(sealIndividualNumbers)
        .set({ ...patch, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
        .where(eq(sealIndividualNumbers.id, id))
        .returning({ id: sealIndividualNumbers.id });
      await recordAudit(tx, { actorId: session.uid, action: 'update', entityType: 'seal_number', entityId: String(id), after: patch });
      return row.id;
    });
    return ok({ id: updated });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'seal number');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[seal-numbers.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(sealIndividualNumbers).where(eq(sealIndividualNumbers.id, id)).returning({ id: sealIndividualNumbers.id });
    if (!row) return null;
    await recordAudit(tx, { actorId: session.uid, action: 'delete', entityType: 'seal_number', entityId: String(id), metadata: {} });
    return row.id;
  });

  if (!removed) return fail('Not found', 404);
  return ok({ id: removed });
}
