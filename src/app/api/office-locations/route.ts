import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { officeLocationMaster, provinceMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: officeLocationMaster.id,
      location_name: officeLocationMaster.locationName,
      province_id: officeLocationMaster.provinceId,
      province_name: provinceMaster.provinceName,
      display: officeLocationMaster.display,
      created_at: officeLocationMaster.createdAt,
      updated_at: officeLocationMaster.updatedAt,
      created_by: officeLocationMaster.createdBy,
      updated_by: officeLocationMaster.updatedBy,
    })
    .from(officeLocationMaster)
    .leftJoin(provinceMaster, eq(officeLocationMaster.provinceId, provinceMaster.id))
    .where(eq(officeLocationMaster.display, 'Y'))
    .orderBy(asc(officeLocationMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  location_name: z.string().min(1).max(255),
  province_id: z.coerce.number().int().positive().optional().nullable(),
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
      .insert(officeLocationMaster)
      .values({
        locationName: d.location_name,
        provinceId: d.province_id ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: officeLocationMaster.id,
        location_name: officeLocationMaster.locationName,
        display: officeLocationMaster.display,
        created_at: officeLocationMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'location name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[office-locations.POST]', err);
    return fail('Server error', 500);
  }
}
