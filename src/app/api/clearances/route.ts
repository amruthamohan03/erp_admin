import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearanceMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: clearanceMaster.id,
      clearance_name: clearanceMaster.clearanceName,
      display: clearanceMaster.display,
      created_at: clearanceMaster.createdAt,
      updated_at: clearanceMaster.updatedAt,
      created_by: clearanceMaster.createdBy,
      updated_by: clearanceMaster.updatedBy,
    })
    .from(clearanceMaster)
    .where(eq(clearanceMaster.display, 'Y'))
    .orderBy(asc(clearanceMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  clearance_name: z.string().min(1).max(255),
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
      .insert(clearanceMaster)
      .values({
        clearanceName: d.clearance_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: clearanceMaster.id,
        clearance_name: clearanceMaster.clearanceName,
        display: clearanceMaster.display,
        created_at: clearanceMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[clearances.POST]', err);
    return fail('Server error', 500);
  }
}
