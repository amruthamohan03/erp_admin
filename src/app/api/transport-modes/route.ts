import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transportModeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: transportModeMaster.id,
      transport_mode_name: transportModeMaster.transportModeName,
      transport_letter: transportModeMaster.transportLetter,
      display: transportModeMaster.display,
      created_at: transportModeMaster.createdAt,
      updated_at: transportModeMaster.updatedAt,
      created_by: transportModeMaster.createdBy,
      updated_by: transportModeMaster.updatedBy,
    })
    .from(transportModeMaster)
    .where(eq(transportModeMaster.display, 'Y'))
    .orderBy(asc(transportModeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  transport_mode_name: z.string().min(1).max(100),
  transport_letter: z.string().min(1).max(5),
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
      .insert(transportModeMaster)
      .values({
        transportModeName: d.transport_mode_name,
        transportLetter: d.transport_letter,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: transportModeMaster.id,
        transport_mode_name: transportModeMaster.transportModeName,
        transport_letter: transportModeMaster.transportLetter,
        display: transportModeMaster.display,
        created_at: transportModeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'transport mode name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[transport-modes.POST]', err);
    return fail('Server error', 500);
  }
}
