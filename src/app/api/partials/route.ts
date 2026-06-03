import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { partials } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: partials.id,
      partial_name: partials.partialName,
      display: partials.display,
      created_at: partials.createdAt,
      updated_at: partials.updatedAt,
      created_by: partials.createdBy,
      updated_by: partials.updatedBy,
    })
    .from(partials)
    .where(eq(partials.display, 'Y'))
    .orderBy(asc(partials.id));

  return ok(rows);
}

const createSchema = z.object({
  partial_name: z.string().min(1).max(150),
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
      .insert(partials)
      .values({
        partialName: d.partial_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: partials.id,
        partial_name: partials.partialName,
        display: partials.display,
        created_at: partials.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'partial name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[partials.POST]', err);
    return fail('Server error', 500);
  }
}
