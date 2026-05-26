import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hscodeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
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
      created_by: hscodeMaster.createdBy,
      updated_by: hscodeMaster.updatedBy,
    })
    .from(hscodeMaster)
    .where(eq(hscodeMaster.display, 'Y'))
    .orderBy(asc(hscodeMaster.id));

  return ok(rows);
}

// numeric(5,2) max value is 999.99 — clamp via Zod so the DB never rejects.
const rate = z.coerce.number().min(0).max(999.99).optional();

const createSchema = z.object({
  hscode_number: z.string().min(1).max(100),
  hscode_ddi: rate,
  hscode_ica: rate,
  hscode_dci: rate,
  hscode_dcl: rate,
  hscode_tpi: rate,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    const toStr = (n: number | undefined) => (n === undefined ? undefined : n.toFixed(2));

    const [row] = await db
      .insert(hscodeMaster)
      .values({
        hscodeNumber: d.hscode_number,
        hscodeDdi: toStr(d.hscode_ddi),
        hscodeIca: toStr(d.hscode_ica),
        hscodeDci: toStr(d.hscode_dci),
        hscodeDcl: toStr(d.hscode_dcl),
        hscodeTpi: toStr(d.hscode_tpi),
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: hscodeMaster.id,
        hscode_number: hscodeMaster.hscodeNumber,
        display: hscodeMaster.display,
        created_at: hscodeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'HS code number');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[hscodes.POST]', err);
    return fail('Server error', 500);
  }
}
