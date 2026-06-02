import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { refererMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: refererMaster.id,
      refferer_name: refererMaster.refererName,
      display: refererMaster.display,
      created_at: refererMaster.createdAt,
      updated_at: refererMaster.updatedAt,
      created_by: refererMaster.createdBy,
      updated_by: refererMaster.updatedBy,
    })
    .from(refererMaster)
    .where(eq(refererMaster.display, 'Y'))
    .orderBy(asc(refererMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  refferer_name: z.string().min(1).max(255),
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
      .insert(refererMaster)
      .values({
        refererName: d.refferer_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: refererMaster.id,
        refferer_name: refererMaster.refererName,
        display: refererMaster.display,
        created_at: refererMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'referrer name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[referers.POST]', err);
    return fail('Server error', 500);
  }
}
