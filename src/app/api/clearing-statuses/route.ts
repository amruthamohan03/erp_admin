import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearingStatusMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: clearingStatusMaster.id,
      clearing_status: clearingStatusMaster.clearingStatus,
      display: clearingStatusMaster.display,
      created_at: clearingStatusMaster.createdAt,
      updated_at: clearingStatusMaster.updatedAt,
      created_by: clearingStatusMaster.createdBy,
      updated_by: clearingStatusMaster.updatedBy,
    })
    .from(clearingStatusMaster)
    .where(eq(clearingStatusMaster.display, 'Y'))
    .orderBy(asc(clearingStatusMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  clearing_status: z.string().min(1).max(100),
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
      .insert(clearingStatusMaster)
      .values({
        clearingStatus: d.clearing_status,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: clearingStatusMaster.id,
        clearing_status: clearingStatusMaster.clearingStatus,
        display: clearingStatusMaster.display,
        created_at: clearingStatusMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[clearing-statuses.POST]', err);
    return fail('Server error', 500);
  }
}
