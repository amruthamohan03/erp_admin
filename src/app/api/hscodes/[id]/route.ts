import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hscodeMaster, type HscodeMasterInsert } from '@/db/schema';
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
      id: hscodeMaster.id,
      hscode_number: hscodeMaster.hscodeNumber,
      hscode_ddi: hscodeMaster.hscodeDdi,
      hscode_ica: hscodeMaster.hscodeIca,
      hscode_dci: hscodeMaster.hscodeDci,
      hscode_dcl: hscodeMaster.hscodeDcl,
      hscode_tpi: hscodeMaster.hscodeTpi,
      display: hscodeMaster.display,
      created_at: hscodeMaster.createdAt,
      updated_at: hscodeMaster.updatedAt,
    })
    .from(hscodeMaster)
    .where(eq(hscodeMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const rate = z.coerce.number().min(0).max(999.99).optional();

const updateSchema = z.object({
  hscode_number: z.string().min(1).max(100).optional(),
  hscode_ddi: rate,
  hscode_ica: rate,
  hscode_dci: rate,
  hscode_dcl: rate,
  hscode_tpi: rate,
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
    const toStr = (n: number | undefined) => (n === undefined ? undefined : n.toFixed(2));

    const patch: Partial<HscodeMasterInsert> = {};
    if (d.hscode_number !== undefined) patch.hscodeNumber = d.hscode_number;
    if (d.hscode_ddi !== undefined) patch.hscodeDdi = toStr(d.hscode_ddi);
    if (d.hscode_ica !== undefined) patch.hscodeIca = toStr(d.hscode_ica);
    if (d.hscode_dci !== undefined) patch.hscodeDci = toStr(d.hscode_dci);
    if (d.hscode_dcl !== undefined) patch.hscodeDcl = toStr(d.hscode_dcl);
    if (d.hscode_tpi !== undefined) patch.hscodeTpi = toStr(d.hscode_tpi);
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(hscodeMaster)
      .set(patch)
      .where(eq(hscodeMaster.id, id))
      .returning({ id: hscodeMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'HS code number');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[hscodes.PUT]', err);
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
    .update(hscodeMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(hscodeMaster.id, id))
    .returning({ id: hscodeMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
