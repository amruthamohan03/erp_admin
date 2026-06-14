// Per-master seal numbers. GET lists the master's individual seals; POST adds new
// ones (single or an expanded range from the client) enforcing the master's
// total_seal limit and global uniqueness, then audits the batch.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNos, sealIndividualNumbers, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const masterId = parseInt(idStr, 10);
  if (Number.isNaN(masterId)) return fail('Invalid id', 400);

  const rows = await db
    .select({
      id: sealIndividualNumbers.id,
      seal_number: sealIndividualNumbers.sealNumber,
      status: sealIndividualNumbers.status,
      notes: sealIndividualNumbers.notes,
      location: mainOfficeMaster.mainLocationName,
      created_at: sealIndividualNumbers.createdAt,
    })
    .from(sealIndividualNumbers)
    .leftJoin(sealNos, eq(sealNos.id, sealIndividualNumbers.sealMasterId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(and(eq(sealIndividualNumbers.sealMasterId, masterId), eq(sealIndividualNumbers.display, 'Y')))
    .orderBy(asc(sealIndividualNumbers.id));

  return ok(rows);
}

const bodySchema = z.object({
  seal_numbers: z.union([z.array(z.string()), z.string()]),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const masterId = parseInt(idStr, 10);
  if (Number.isNaN(masterId)) return fail('Invalid id', 400);

  let body: unknown;
  try { body = await req.json(); } catch { return fail('Invalid JSON body', 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });

  const raw = parsed.data.seal_numbers;
  const list = (Array.isArray(raw) ? raw : raw.split(/[\r\n,]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return fail('No valid seal numbers found', 422);

  const [master] = await db.select({ totalSeal: sealNos.totalSeal }).from(sealNos).where(eq(sealNos.id, masterId));
  if (!master) return fail('Seal master not found', 404);

  const [{ cnt }] = await db
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(sealIndividualNumbers)
    .where(eq(sealIndividualNumbers.sealMasterId, masterId));
  const available = master.totalSeal - cnt;
  if (list.length > available) {
    return fail(`Cannot add ${list.length} seal(s). Limit ${master.totalSeal}, current ${cnt}, available ${available}.`, 422);
  }

  // Reject any seal number that already exists (global unique).
  const existing = await db
    .select({ seal_number: sealIndividualNumbers.sealNumber })
    .from(sealIndividualNumbers)
    .where(inArray(sealIndividualNumbers.sealNumber, list));
  if (existing.length > 0) {
    return fail('Duplicate seal numbers found: ' + existing.map((e) => e.seal_number).join(', '), 422);
  }

  const inserted = await db.transaction(async (tx) => {
    let n = 0;
    for (const num of list) {
      await tx.insert(sealIndividualNumbers).values({
        sealMasterId: masterId, sealNumber: num, status: 'Available',
        createdBy: session.uid, updatedBy: session.uid,
      });
      n += 1;
    }
    await recordAudit(tx, {
      actorId: session.uid, action: 'create', entityType: 'seal_number',
      entityId: String(masterId), after: { added: list }, metadata: { seal_master_id: masterId, count: n },
    });
    return n;
  });

  return ok({ added: inserted }, 201);
}
