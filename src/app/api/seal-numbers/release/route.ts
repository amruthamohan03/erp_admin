// POST /api/seal-numbers/release — flip the given seal numbers from 'Used' back to
// 'Available' (e.g. when an import/export assignment is undone). Accepts an array or
// a newline/comma string. Audited.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';

const bodySchema = z.object({ seal_numbers: z.union([z.array(z.string()), z.string()]) });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('Invalid JSON body', 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });

  const raw = parsed.data.seal_numbers;
  const list = (Array.isArray(raw) ? raw : raw.split(/[\r\n,]+/)).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return fail('No seal numbers provided', 422);

  const { released, failed } = await db.transaction(async (tx) => {
    let n = 0;
    const fail2: string[] = [];
    for (const num of list) {
      const [row] = await tx
        .update(sealIndividualNumbers)
        .set({
          status: 'Available',
          notes: sql`'Released on ' || to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')`,
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(and(eq(sealIndividualNumbers.sealNumber, num), eq(sealIndividualNumbers.status, 'Used')))
        .returning({ id: sealIndividualNumbers.id });
      if (row) n += 1; else fail2.push(num);
    }
    if (n > 0) {
      await recordAudit(tx, { actorId: session.uid, action: 'update', entityType: 'seal_number', entityId: 'bulk', after: { released: list }, metadata: { op: 'release', released: n } });
    }
    return { released: n, failed: fail2 };
  });

  return ok({ released, failed, total: list.length });
}
