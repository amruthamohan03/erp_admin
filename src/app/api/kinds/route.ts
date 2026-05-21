import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kindMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: kindMaster.id,
      kind_name: kindMaster.kindName,
      kind_short_name: kindMaster.kindShortName,
      display: kindMaster.display,
      created_at: kindMaster.createdAt,
      updated_at: kindMaster.updatedAt,
      created_by: kindMaster.createdBy,
      updated_by: kindMaster.updatedBy,
    })
    .from(kindMaster)
    .where(eq(kindMaster.display, 'Y'))
    .orderBy(asc(kindMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  kind_name: z.string().min(1).max(100),
  kind_short_name: z.string().min(1).max(20),
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
      .insert(kindMaster)
      .values({
        kindName: d.kind_name,
        kindShortName: d.kind_short_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: kindMaster.id,
        kind_name: kindMaster.kindName,
        kind_short_name: kindMaster.kindShortName,
        display: kindMaster.display,
        created_at: kindMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[kinds.POST]', err);
    return fail('Server error', 500);
  }
}
