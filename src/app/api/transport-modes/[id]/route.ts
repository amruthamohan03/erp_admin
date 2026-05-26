import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transportModeMaster, type TransportModeMasterInsert } from '@/db/schema';
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
      id: transportModeMaster.id,
      transport_mode_name: transportModeMaster.transportModeName,
      transport_letter: transportModeMaster.transportLetter,
      display: transportModeMaster.display,
      created_at: transportModeMaster.createdAt,
      updated_at: transportModeMaster.updatedAt,
    })
    .from(transportModeMaster)
    .where(eq(transportModeMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  transport_mode_name: z.string().min(1).max(100).optional(),
  transport_letter: z.string().min(1).max(5).optional(),
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

    const patch: Partial<TransportModeMasterInsert> = {};
    if (d.transport_mode_name !== undefined) patch.transportModeName = d.transport_mode_name;
    if (d.transport_letter !== undefined) patch.transportLetter = d.transport_letter;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(transportModeMaster)
      .set(patch)
      .where(eq(transportModeMaster.id, id))
      .returning({ id: transportModeMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'transport mode name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[transport-modes.PUT]', err);
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
    .update(transportModeMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(transportModeMaster.id, id))
    .returning({ id: transportModeMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
