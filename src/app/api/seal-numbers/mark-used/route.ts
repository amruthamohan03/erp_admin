// POST /api/seal-numbers/mark-used — flip the given seal numbers from 'Available'
// to 'Used' (assignment to an import/export). Damaged/already-used seals fail.
// Accepts an array or a newline/comma string. Audited.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';

const bodySchema = z.object({
  seal_numbers: z.union([z.array(z.string()), z.string()]),
  reference_info: z.string().max(255).optional(),
});

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
  const note = parsed.data.reference_info ? `Assigned: ${parsed.data.reference_info}` : 'Assigned to import/export';

  const { marked, failed } = await db.transaction(async (tx) => {
    let n = 0;
    const fail2: string[] = [];
    for (const num of list) {
      const [row] = await tx
        .update(sealIndividualNumbers)
        .set({ status: 'Used', notes: note, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
        .where(and(eq(sealIndividualNumbers.sealNumber, num), eq(sealIndividualNumbers.status, 'Available')))
        .returning({ id: sealIndividualNumbers.id });
      if (row) n += 1; else fail2.push(num);
    }
    if (n > 0) {
      await recordAudit(tx, { actorId: session.uid, action: 'update', entityType: 'seal_number', entityId: 'bulk', after: { used: list }, metadata: { op: 'mark-used', marked: n } });
    }
    return { marked: n, failed: fail2 };
  });

  return ok({ marked, failed, total: list.length });
}
