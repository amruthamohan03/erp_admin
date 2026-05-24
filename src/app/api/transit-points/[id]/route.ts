import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transitPointMaster, type TransitPointMasterInsert } from '@/db/schema';
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
      id: transitPointMaster.id,
      transit_point_name: transitPointMaster.transitPointName,
      entry_point: transitPointMaster.entryPoint,
      exit_point: transitPointMaster.exitPoint,
      loading: transitPointMaster.loading,
      destination: transitPointMaster.destination,
      warehouse: transitPointMaster.warehouse,
      location: transitPointMaster.location,
      display: transitPointMaster.display,
      created_at: transitPointMaster.createdAt,
      updated_at: transitPointMaster.updatedAt,
    })
    .from(transitPointMaster)
    .where(eq(transitPointMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  transit_point_name: z.string().min(1).max(255).optional(),
  entry_point: z.boolean().optional(),
  exit_point: z.boolean().optional(),
  loading: z.boolean().optional(),
  destination: z.boolean().optional(),
  warehouse: z.boolean().optional(),
  location: z.boolean().optional(),
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

    const patch: Partial<TransitPointMasterInsert> = {};
    if (d.transit_point_name !== undefined) patch.transitPointName = d.transit_point_name;
    if (d.entry_point !== undefined) patch.entryPoint = d.entry_point;
    if (d.exit_point !== undefined) patch.exitPoint = d.exit_point;
    if (d.loading !== undefined) patch.loading = d.loading;
    if (d.destination !== undefined) patch.destination = d.destination;
    if (d.warehouse !== undefined) patch.warehouse = d.warehouse;
    if (d.location !== undefined) patch.location = d.location;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(transitPointMaster)
      .set(patch)
      .where(eq(transitPointMaster.id, id))
      .returning({ id: transitPointMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[transit-points.PUT]', err);
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
    .update(transitPointMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(transitPointMaster.id, id))
    .returning({ id: transitPointMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
