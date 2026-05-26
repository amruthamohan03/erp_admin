import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { incotermMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: incotermMaster.id,
      incoterm_short_name: incotermMaster.incotermShortName,
      incoterm_full_name: incotermMaster.incotermFullName,
      display: incotermMaster.display,
      created_at: incotermMaster.createdAt,
      updated_at: incotermMaster.updatedAt,
      created_by: incotermMaster.createdBy,
      updated_by: incotermMaster.updatedBy,
    })
    .from(incotermMaster)
    .where(eq(incotermMaster.display, 'Y'))
    .orderBy(asc(incotermMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  incoterm_short_name: z.string().min(1).max(10),
  incoterm_full_name: z.string().min(1).max(250),
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
      .insert(incotermMaster)
      .values({
        incotermShortName: d.incoterm_short_name,
        incotermFullName: d.incoterm_full_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: incotermMaster.id,
        incoterm_short_name: incotermMaster.incotermShortName,
        display: incotermMaster.display,
        created_at: incotermMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'incoterm code');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[incoterms.POST]', err);
    return fail('Server error', 500);
  }
}
