import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { unitMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: unitMaster.id,
      unit_name: unitMaster.unitName,
      unit_code: unitMaster.unitCode,
      display: unitMaster.display,
      created_at: unitMaster.createdAt,
      updated_at: unitMaster.updatedAt,
      created_by: unitMaster.createdBy,
      updated_by: unitMaster.updatedBy,
    })
    .from(unitMaster)
    .where(eq(unitMaster.display, 'Y'))
    .orderBy(asc(unitMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  unit_name: z.string().min(1).max(100),
  unit_code: z.string().max(20).optional().nullable(),
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

    const [row] = await db
      .insert(unitMaster)
      .values({
        unitName: d.unit_name,
        unitCode: d.unit_code ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: unitMaster.id,
        unit_name: unitMaster.unitName,
        unit_code: unitMaster.unitCode,
        display: unitMaster.display,
        created_at: unitMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[units.POST]', err);
    return fail('Server error', 500);
  }
}
