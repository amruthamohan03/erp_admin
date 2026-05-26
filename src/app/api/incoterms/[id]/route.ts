import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { incotermMaster, type IncotermMasterInsert } from '@/db/schema';
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
      id: incotermMaster.id,
      incoterm_short_name: incotermMaster.incotermShortName,
      incoterm_full_name: incotermMaster.incotermFullName,
      display: incotermMaster.display,
      created_at: incotermMaster.createdAt,
      updated_at: incotermMaster.updatedAt,
    })
    .from(incotermMaster)
    .where(eq(incotermMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  incoterm_short_name: z.string().min(1).max(10).optional(),
  incoterm_full_name: z.string().min(1).max(250).optional(),
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

    const patch: Partial<IncotermMasterInsert> = {};
    if (d.incoterm_short_name !== undefined) patch.incotermShortName = d.incoterm_short_name;
    if (d.incoterm_full_name !== undefined) patch.incotermFullName = d.incoterm_full_name;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(incotermMaster)
      .set(patch)
      .where(eq(incotermMaster.id, id))
      .returning({ id: incotermMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'incoterm code');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[incoterms.PUT]', err);
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
    .update(incotermMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(incotermMaster.id, id))
    .returning({ id: incotermMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
