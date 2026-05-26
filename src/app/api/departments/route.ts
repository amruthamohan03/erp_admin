import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departmentMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: departmentMaster.id,
      department_name: departmentMaster.departmentName,
      display: departmentMaster.display,
      created_at: departmentMaster.createdAt,
      updated_at: departmentMaster.updatedAt,
      created_by: departmentMaster.createdBy,
      updated_by: departmentMaster.updatedBy,
    })
    .from(departmentMaster)
    .where(eq(departmentMaster.display, 'Y'))
    .orderBy(asc(departmentMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  department_name: z.string().min(1).max(100),
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
      .insert(departmentMaster)
      .values({
        departmentName: d.department_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: departmentMaster.id,
        department_name: departmentMaster.departmentName,
        display: departmentMaster.display,
        created_at: departmentMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'department name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[departments.POST]', err);
    return fail('Server error', 500);
  }
}
