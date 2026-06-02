import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { phaseMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: phaseMaster.id,
      phase_name: phaseMaster.phaseName,
      phase_code: phaseMaster.phaseCode,
      display: phaseMaster.display,
      created_at: phaseMaster.createdAt,
      updated_at: phaseMaster.updatedAt,
      created_by: phaseMaster.createdBy,
      updated_by: phaseMaster.updatedBy,
    })
    .from(phaseMaster)
    .where(eq(phaseMaster.display, 'Y'))
    .orderBy(asc(phaseMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  phase_name: z.string().min(1).max(150),
  phase_code: z.string().min(1).max(50),
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
      .insert(phaseMaster)
      .values({
        phaseName: d.phase_name,
        phaseCode: d.phase_code,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: phaseMaster.id,
        phase_name: phaseMaster.phaseName,
        phase_code: phaseMaster.phaseCode,
        display: phaseMaster.display,
        created_at: phaseMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'phase name or code');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[phases.POST]', err);
    return fail('Server error', 500);
  }
}
