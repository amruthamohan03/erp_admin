import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { originMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: originMaster.id,
      origin_name: originMaster.originName,
      display: originMaster.display,
      created_at: originMaster.createdAt,
      updated_at: originMaster.updatedAt,
      created_by: originMaster.createdBy,
      updated_by: originMaster.updatedBy,
    })
    .from(originMaster)
    .where(eq(originMaster.display, 'Y'))
    .orderBy(asc(originMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  origin_name: z.string().min(1).max(255),
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
      .insert(originMaster)
      .values({
        originName: d.origin_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: originMaster.id,
        origin_name: originMaster.originName,
        display: originMaster.display,
        created_at: originMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[origins.POST]', err);
    return fail('Server error', 500);
  }
}
