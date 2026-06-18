import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNumber } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  sealNumberBulkActionSchema,
  parseSealNumberList,
} from '@/schemas/seals';

// POST /api/v1/seal-numbers/release
// Bulk flip from 'Used' back to 'Available'. Use when an import/export
// assignment is undone. Damaged seals stay Damaged — only Used ones
// transition, others land in `failed` for caller-side display.
//
// Body: { seal_numbers: string[] | string }

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = sealNumberBulkActionSchema.parse(await req.json());
  const list = parseSealNumberList(data.seal_numbers);
  if (list.length === 0) {
    throw new BadRequestError('No seal numbers provided');
  }

  const { released, failed } = await db.transaction(async (tx) => {
    let n = 0;
    const failedNumbers: string[] = [];
    for (const num of list) {
      const [row] = await tx
        .update(sealNumber)
        .set({
          status: 'Available',
          notes: sql`'Released on ' || to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')`,
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(
          and(
            eq(sealNumber.sealNumber, num),
            eq(sealNumber.status, 'Used'),
          ),
        )
        .returning({ id: sealNumber.id });
      if (row) n += 1;
      else failedNumbers.push(num);
    }
    if (n > 0) {
      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: 'seal_number',
        entityId: 'bulk',
        after: { released: list },
        metadata: { op: 'release', released: n },
      });
    }
    return { released: n, failed: failedNumbers };
  });

  return ok({ released, failed, total: list.length });
});
