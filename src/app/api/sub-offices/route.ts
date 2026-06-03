import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: subOfficeMaster.id,
      sub_office_name: subOfficeMaster.subOfficeName,
      display: subOfficeMaster.display,
      created_at: subOfficeMaster.createdAt,
      updated_at: subOfficeMaster.updatedAt,
      created_by: subOfficeMaster.createdBy,
      updated_by: subOfficeMaster.updatedBy,
    })
    .from(subOfficeMaster)
    .where(eq(subOfficeMaster.display, 'Y'))
    .orderBy(asc(subOfficeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  sub_office_name: z.string().min(1).max(255),
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
      .insert(subOfficeMaster)
      .values({
        subOfficeName: d.sub_office_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: subOfficeMaster.id,
        sub_office_name: subOfficeMaster.subOfficeName,
        display: subOfficeMaster.display,
        created_at: subOfficeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'sub office name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[sub-offices.POST]', err);
    return fail('Server error', 500);
  }
}
