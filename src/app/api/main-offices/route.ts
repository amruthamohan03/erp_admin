import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: mainOfficeMaster.id,
      main_location_name: mainOfficeMaster.mainLocationName,
      display: mainOfficeMaster.display,
      created_at: mainOfficeMaster.createdAt,
      updated_at: mainOfficeMaster.updatedAt,
      created_by: mainOfficeMaster.createdBy,
      updated_by: mainOfficeMaster.updatedBy,
    })
    .from(mainOfficeMaster)
    .where(eq(mainOfficeMaster.display, 'Y'))
    .orderBy(asc(mainOfficeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  main_location_name: z.string().min(1).max(255),
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
      .insert(mainOfficeMaster)
      .values({
        mainLocationName: d.main_location_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: mainOfficeMaster.id,
        main_location_name: mainOfficeMaster.mainLocationName,
        display: mainOfficeMaster.display,
        created_at: mainOfficeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'main office name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[main-offices.POST]', err);
    return fail('Server error', 500);
  }
}
