import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { airOperatingCompanyMaster, type AirOperatingCompanyMasterInsert } from '@/db/schema';
import { ok, requireAuth, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { AIR_OPERATING_COMPANY_RESOURCE, airOperatingCompanyUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

const selection = {
  id: airOperatingCompanyMaster.id,
  air_operating_company_name: airOperatingCompanyMaster.airOperatingCompanyName,
  display: airOperatingCompanyMaster.display,
  created_at: airOperatingCompanyMaster.createdAt,
  updated_at: airOperatingCompanyMaster.updatedAt,
};

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`"${raw}" is not a valid air operating company id.`);
  }
  return id;
}

const notFound = (id: number): NotFoundError =>
  new NotFoundError(`Air operating company #${id} was not found. It may have been deleted — reload the list.`);

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const [row] = await db.select(selection).from(airOperatingCompanyMaster).where(eq(airOperatingCompanyMaster.id, id)).limit(1);
  if (!row) throw notFound(id);
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(AIR_OPERATING_COMPANY_RESOURCE, 'edit');
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const data = airOperatingCompanyUpdateSchema.parse(await req.json());

  const patch: Partial<AirOperatingCompanyMasterInsert> = {};
  if (data.air_operating_company_name !== undefined) patch.airOperatingCompanyName = data.air_operating_company_name;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update — send a name or an active flag.');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const updated = await db.transaction(async (tx) => {
    const [before] = await tx.select(selection).from(airOperatingCompanyMaster).where(eq(airOperatingCompanyMaster.id, id)).limit(1);
    if (!before) return null;
    await tx.update(airOperatingCompanyMaster).set(patch).where(eq(airOperatingCompanyMaster.id, id));
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'air_operating_company',
      entityId: String(id),
      before,
      after: data,
    });
    return id;
  });

  if (!updated) throw notFound(id);
  return ok({ id: updated });
});

// §4.27 — soft delete. Files keep the name they were saved with, and the row
// stays so it can be switched back on.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(AIR_OPERATING_COMPANY_RESOURCE, 'delete');
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(airOperatingCompanyMaster)
      .set({ display: 'N', updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(airOperatingCompanyMaster.id, id))
      .returning({ id: airOperatingCompanyMaster.id });
    if (!row) return null;
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'air_operating_company',
      entityId: String(id),
    });
    return row.id;
  });

  if (!deleted) throw notFound(id);
  return ok({ id: deleted });
});
