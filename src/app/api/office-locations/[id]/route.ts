import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { officeLocationMaster, type OfficeLocationMasterInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: officeLocationMaster.id,
      location_name: officeLocationMaster.locationName,
      province_id: officeLocationMaster.provinceId,
      display: officeLocationMaster.display,
      created_at: officeLocationMaster.createdAt,
      updated_at: officeLocationMaster.updatedAt,
    })
    .from(officeLocationMaster)
    .where(eq(officeLocationMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  location_name: z.string().min(1).max(255).optional(),
  province_id: z.coerce.number().int().positive().optional().nullable(),
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

    const patch: Partial<OfficeLocationMasterInsert> = {};
    if (d.location_name !== undefined) patch.locationName = d.location_name;
    if (d.province_id !== undefined) patch.provinceId = d.province_id;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(officeLocationMaster)
      .set(patch)
      .where(eq(officeLocationMaster.id, id))
      .returning({ id: officeLocationMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'location name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[office-locations.PUT]', err);
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
    .update(officeLocationMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(officeLocationMaster.id, id))
    .returning({ id: officeLocationMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
