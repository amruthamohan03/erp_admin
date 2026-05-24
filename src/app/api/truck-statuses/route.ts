import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { truckStatusMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: truckStatusMaster.id,
      truck_status: truckStatusMaster.truckStatus,
      display: truckStatusMaster.display,
      created_at: truckStatusMaster.createdAt,
      updated_at: truckStatusMaster.updatedAt,
      created_by: truckStatusMaster.createdBy,
      updated_by: truckStatusMaster.updatedBy,
    })
    .from(truckStatusMaster)
    .where(eq(truckStatusMaster.display, 'Y'))
    .orderBy(asc(truckStatusMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  truck_status: z.string().min(1).max(300),
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
      .insert(truckStatusMaster)
      .values({
        truckStatus: d.truck_status,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: truckStatusMaster.id,
        truck_status: truckStatusMaster.truckStatus,
        display: truckStatusMaster.display,
        created_at: truckStatusMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[truck-statuses.POST]', err);
    return fail('Server error', 500);
  }
}
