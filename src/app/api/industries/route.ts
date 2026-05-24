import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { industryMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: industryMaster.id,
      industry_name: industryMaster.industryName,
      display: industryMaster.display,
      created_at: industryMaster.createdAt,
      updated_at: industryMaster.updatedAt,
      created_by: industryMaster.createdBy,
      updated_by: industryMaster.updatedBy,
    })
    .from(industryMaster)
    .where(eq(industryMaster.display, 'Y'))
    .orderBy(asc(industryMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  industry_name: z.string().min(1).max(200),
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
      .insert(industryMaster)
      .values({
        industryName: d.industry_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: industryMaster.id,
        industry_name: industryMaster.industryName,
        display: industryMaster.display,
        created_at: industryMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[industries.POST]', err);
    return fail('Server error', 500);
  }
}
