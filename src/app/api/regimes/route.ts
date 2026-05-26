import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { regimeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: regimeMaster.id,
      regime_name: regimeMaster.regimeName,
      type: regimeMaster.type,
      display: regimeMaster.display,
      created_at: regimeMaster.createdAt,
      updated_at: regimeMaster.updatedAt,
      created_by: regimeMaster.createdBy,
      updated_by: regimeMaster.updatedBy,
    })
    .from(regimeMaster)
    .where(eq(regimeMaster.display, 'Y'))
    .orderBy(asc(regimeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  regime_name: z.string().min(1).max(200),
  type: z.enum(['I', 'E', 'IE']),
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
      .insert(regimeMaster)
      .values({
        regimeName: d.regime_name,
        type: d.type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: regimeMaster.id,
        regime_name: regimeMaster.regimeName,
        type: regimeMaster.type,
        display: regimeMaster.display,
        created_at: regimeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'regime name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[regimes.POST]', err);
    return fail('Server error', 500);
  }
}
