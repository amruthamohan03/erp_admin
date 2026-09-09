import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNumber } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { assertSealsReleasable, detachSealsFromExports } from '@/db/queries/sealUsage';
import {
  sealNumberBulkActionSchema,
  parseSealNumberList,
} from '@/schemas/seals';

// POST /api/v1/seal-numbers/release
// Bulk flip from 'Used' back to 'Available'. Use when an import/export
// assignment is undone. Damaged seals stay Damaged — only Used ones
// transition, others land in `failed` for caller-side display.
//
// Body: { seal_numbers: string[] | string, detach?: boolean }
//
// A seal that is still named by a live export is NOT released on the first
// call. Freeing it there and then left the export claiming a seal the master
// had already handed on, so the same physical seal could be issued twice. The
// request is refused with 409 and the offending files named (§4.23); repeating
// it with `detach: true` takes the seal off those exports and releases it, both
// in one transaction.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = sealNumberBulkActionSchema.parse(await req.json());
  const list = parseSealNumberList(data.seal_numbers);
  if (list.length === 0) {
    throw new BadRequestError('No seal numbers provided');
  }

  // Read before the transaction so the refusal path opens none. Throws with the
  // files named when they are held and the caller has not confirmed (§4.37).
  const holders = await assertSealsReleasable(list, { confirmed: data.detach }, db);

  const { released, failed, detached } = await db.transaction(async (tx) => {
    // Take the seals off their exports FIRST. If that fails the release has not
    // happened either, which is the safe direction: a seal still recorded as
    // Used is recoverable, a seal freed off a file that still names it is not.
    const detachedCount =
      holders.length > 0 ? await detachSealsFromExports(holders, session.uid, tx) : 0;

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
        metadata: {
          op: 'release',
          released: n,
          // What the release cost elsewhere, so the seal's own trail names the
          // consignments it was taken off.
          detached_from: holders.map((h) => h.mca_ref ?? `export #${h.export_id}`),
        },
      });
    }
    return { released: n, failed: failedNumbers, detached: detachedCount };
  });

  return ok({ released, failed, detached, total: list.length });
});
