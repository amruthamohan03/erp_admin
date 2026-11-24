import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apurementOptionMaster, type ApurementOptionRow } from '@/db/schema';
import { ok, requireAuth, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { APUREMENT_OPTION_RESOURCE, apurementOptionUpdateSchema } from '@/schemas';
import { apurementOptionSelection } from '../route';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError(`"${raw}" is not a valid apurement option id.`);
  return id;
}

const notFound = (id: number): NotFoundError =>
  new NotFoundError(`Apurement option #${id} was not found. It may have been deleted — reload the list.`);

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const [row] = await db.select(apurementOptionSelection).from(apurementOptionMaster).where(eq(apurementOptionMaster.id, id)).limit(1);
  if (!row) throw notFound(id);
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(APUREMENT_OPTION_RESOURCE, 'edit');
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const data = apurementOptionUpdateSchema.parse(await req.json());

  const updated = await db.transaction(async (tx) => {
    const [before] = await tx.select(apurementOptionSelection).from(apurementOptionMaster).where(eq(apurementOptionMaster.id, id)).limit(1);
    if (!before) return null;

    const patch: Partial<ApurementOptionRow> = {};
    if (data.option_name !== undefined) patch.optionName = data.option_name;
    // Only a Type can demand a Remarque.
    if (data.requires_remark !== undefined) patch.requiresRemark = before.option_group === 'type' ? data.requires_remark : false;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update — send a name, the Remarque rule or an active flag.');
    }

    await tx
      .update(apurementOptionMaster)
      .set({ ...patch, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(apurementOptionMaster.id, id));
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'apurement_option',
      entityId: String(id),
      module: 'masters',
      before,
      after: { ...before, ...data },
    });
    return id;
  });

  if (!updated) throw notFound(id);
  return ok({ id: updated });
});

// §4.27 — soft delete. Files keep the option they were saved with (the grid
// still names it), and the row stays so it can be switched back on.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(APUREMENT_OPTION_RESOURCE, 'delete');
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(apurementOptionMaster)
      .set({ display: 'N', updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(apurementOptionMaster.id, id))
      .returning({ id: apurementOptionMaster.id });
    if (!row) return null;
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'apurement_option',
      entityId: String(id),
      module: 'masters',
    });
    return row.id;
  });

  if (!deleted) throw notFound(id);
  return ok({ id: deleted });
});
