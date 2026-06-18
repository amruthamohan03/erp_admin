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

// POST /api/v1/seal-numbers/mark-used
// Bulk flip from 'Available' to 'Used'. Only Available seals transition;
// already-Used or Damaged ones land in the `failed` list with their
// number so the caller can surface them in the UI.
//
// Body: { seal_numbers: string[] | string, reference_info?: string }

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = sealNumberBulkActionSchema.parse(await req.json());
  const list = parseSealNumberList(data.seal_numbers);
  if (list.length === 0) {
    throw new BadRequestError('No seal numbers provided');
  }

  const note = data.reference_info
    ? `Assigned: ${data.reference_info}`
    : 'Assigned to import/export';

  const { marked, failed } = await db.transaction(async (tx) => {
    let n = 0;
    const failedNumbers: string[] = [];
    for (const num of list) {
      const [row] = await tx
        .update(sealNumber)
        .set({
          status: 'Used',
          notes: note,
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(
          and(
            eq(sealNumber.sealNumber, num),
            eq(sealNumber.status, 'Available'),
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
        after: { marked_used: list },
        metadata: { op: 'mark-used', marked: n, reference_info: data.reference_info ?? null },
      });
    }
    return { marked: n, failed: failedNumbers };
  });

  return ok({ marked, failed, total: list.length });
});
