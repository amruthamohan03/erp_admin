import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transitPointMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
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
      created_by: transitPointMaster.createdBy,
      updated_by: transitPointMaster.updatedBy,
    })
    .from(transitPointMaster)
    .where(eq(transitPointMaster.display, 'Y'))
    .orderBy(asc(transitPointMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  transit_point_name: z.string().min(1).max(255),
  entry_point: z.boolean().optional(),
  exit_point: z.boolean().optional(),
  loading: z.boolean().optional(),
  destination: z.boolean().optional(),
  warehouse: z.boolean().optional(),
  location: z.boolean().optional(),
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
      .insert(transitPointMaster)
      .values({
        transitPointName: d.transit_point_name,
        entryPoint: d.entry_point ?? true,
        exitPoint: d.exit_point ?? true,
        loading: d.loading ?? true,
        destination: d.destination ?? true,
        warehouse: d.warehouse ?? false,
        location: d.location ?? false,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: transitPointMaster.id,
        transit_point_name: transitPointMaster.transitPointName,
        display: transitPointMaster.display,
        created_at: transitPointMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'transit point name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[transit-points.POST]', err);
    return fail('Server error', 500);
  }
}
