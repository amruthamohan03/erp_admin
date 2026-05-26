import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { provinceMaster, originMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: provinceMaster.id,
      province_name: provinceMaster.provinceName,
      origin_id: provinceMaster.originId,
      origin_name: originMaster.originName,
      display: provinceMaster.display,
      created_at: provinceMaster.createdAt,
      updated_at: provinceMaster.updatedAt,
      created_by: provinceMaster.createdBy,
      updated_by: provinceMaster.updatedBy,
    })
    .from(provinceMaster)
    .leftJoin(originMaster, eq(provinceMaster.originId, originMaster.id))
    .where(eq(provinceMaster.display, 'Y'))
    .orderBy(asc(provinceMaster.provinceName));

  return ok(rows);
}

const createSchema = z.object({
  province_name: z.string().min(1).max(255),
  origin_id: z.coerce.number().int().positive(),
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
      .insert(provinceMaster)
      .values({
        provinceName: d.province_name,
        originId: d.origin_id,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: provinceMaster.id,
        province_name: provinceMaster.provinceName,
        origin_id: provinceMaster.originId,
        display: provinceMaster.display,
        created_at: provinceMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'province name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[provinces.POST]', err);
    return fail('Server error', 500);
  }
}
