import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupCompanyMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: groupCompanyMaster.id,
      group_company_name: groupCompanyMaster.groupCompanyName,
      display: groupCompanyMaster.display,
      created_at: groupCompanyMaster.createdAt,
      updated_at: groupCompanyMaster.updatedAt,
      created_by: groupCompanyMaster.createdBy,
      updated_by: groupCompanyMaster.updatedBy,
    })
    .from(groupCompanyMaster)
    .where(eq(groupCompanyMaster.display, 'Y'))
    .orderBy(asc(groupCompanyMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  group_company_name: z.string().min(1).max(255),
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
      .insert(groupCompanyMaster)
      .values({
        groupCompanyName: d.group_company_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: groupCompanyMaster.id,
        group_company_name: groupCompanyMaster.groupCompanyName,
        display: groupCompanyMaster.display,
        created_at: groupCompanyMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'group company name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[group-companies.POST]', err);
    return fail('Server error', 500);
  }
}
