import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  transportModeMaster,
  type TransportModeMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { transportModeUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .select({
      id: transportModeMaster.id,
      transport_mode_name: transportModeMaster.transportModeName,
      transport_letter: transportModeMaster.transportLetter,
      display: transportModeMaster.display,
      created_at: transportModeMaster.createdAt,
      updated_at: transportModeMaster.updatedAt,
    })
    .from(transportModeMaster)
    .where(eq(transportModeMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = transportModeUpdateSchema.parse(await req.json());

  const patch: Partial<TransportModeMasterInsert> = {};
  if (data.transport_mode_name !== undefined)
    patch.transportModeName = data.transport_mode_name;
  if (data.transport_letter !== undefined)
    patch.transportLetter = data.transport_letter;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(transportModeMaster)
    .set(patch)
    .where(eq(transportModeMaster.id, id))
    .returning({ id: transportModeMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .update(transportModeMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(transportModeMaster.id, id))
    .returning({ id: transportModeMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
