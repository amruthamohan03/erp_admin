import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { truckStatusMaster, type TruckStatusMasterInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: truckStatusMaster.id,
      truck_status: truckStatusMaster.truckStatus,
      display: truckStatusMaster.display,
      created_at: truckStatusMaster.createdAt,
      updated_at: truckStatusMaster.updatedAt,
    })
    .from(truckStatusMaster)
    .where(eq(truckStatusMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  truck_status: z.string().min(1).max(300).optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const patch: Partial<TruckStatusMasterInsert> = {};
    if (d.truck_status !== undefined) patch.truckStatus = d.truck_status;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(truckStatusMaster)
      .set(patch)
      .where(eq(truckStatusMaster.id, id))
      .returning({ id: truckStatusMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[truck-statuses.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .update(truckStatusMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(truckStatusMaster.id, id))
    .returning({ id: truckStatusMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
