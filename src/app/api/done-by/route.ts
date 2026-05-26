import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { doneBy } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: doneBy.id,
      done_by_name: doneBy.doneByName,
      display: doneBy.display,
      created_at: doneBy.createdAt,
      updated_at: doneBy.updatedAt,
    })
    .from(doneBy)
    .where(eq(doneBy.display, 'Y'))
    .orderBy(asc(doneBy.id));

  return ok(rows);
}

const createSchema = z.object({
  done_by_name: z.string().min(1).max(50),
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
      .insert(doneBy)
      .values({
        doneByName: d.done_by_name,
      })
      .returning({
        id: doneBy.id,
        done_by_name: doneBy.doneByName,
        display: doneBy.display,
        created_at: doneBy.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Done By name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[done-by.POST]', err);
    return fail('Server error', 500);
  }
}
