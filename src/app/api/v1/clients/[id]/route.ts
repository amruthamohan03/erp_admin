import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster, type ClientMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { clientUpdateSchema } from '@/schemas';

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
      id: clientMaster.id,
      client_code: clientMaster.clientCode,
      name: clientMaster.name,
      legal_name: clientMaster.legalName,
      email: clientMaster.email,
      phone: clientMaster.phone,
      address: clientMaster.address,
      tax_id: clientMaster.taxId,
      display: clientMaster.display,
      created_at: clientMaster.createdAt,
      updated_at: clientMaster.updatedAt,
    })
    .from(clientMaster)
    .where(eq(clientMaster.id, id))
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

  const data = clientUpdateSchema.parse(await req.json());

  const patch: Partial<ClientMasterInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.legal_name !== undefined) patch.legalName = data.legal_name;
  if (data.email !== undefined) patch.email = data.email;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.address !== undefined) patch.address = data.address;
  if (data.tax_id !== undefined) patch.taxId = data.tax_id;
  if (data.display !== undefined) patch.display = data.display;

  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const [row] = await db
      .update(clientMaster)
      .set(patch)
      .where(eq(clientMaster.id, id))
      .returning({ id: clientMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      throw new ConflictError('Conflict updating client');
    }
    throw err;
  }
});

// Soft-delete: flip display to 'N'. References from license/invoice/etc. stay
// intact (the FK is ON DELETE RESTRICT so a hard delete would fail anyway when
// dependent rows exist).

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .update(clientMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(clientMaster.id, id))
    .returning({ id: clientMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
