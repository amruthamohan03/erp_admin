import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feetContainerMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: feetContainerMaster.id,
      feet_container_size: feetContainerMaster.feetContainerSize,
      display: feetContainerMaster.display,
      created_at: feetContainerMaster.createdAt,
      updated_at: feetContainerMaster.updatedAt,
      created_by: feetContainerMaster.createdBy,
      updated_by: feetContainerMaster.updatedBy,
    })
    .from(feetContainerMaster)
    .where(eq(feetContainerMaster.display, 'Y'))
    .orderBy(asc(feetContainerMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  feet_container_size: z.string().min(1).max(50),
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
      .insert(feetContainerMaster)
      .values({
        feetContainerSize: d.feet_container_size,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: feetContainerMaster.id,
        feet_container_size: feetContainerMaster.feetContainerSize,
        display: feetContainerMaster.display,
        created_at: feetContainerMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'container size');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[feet-containers.POST]', err);
    return fail('Server error', 500);
  }
}
