// Quotation list + create. Mutations write the header and its line items in one
// transaction with an audit row (§4.10). Totals (sub-total, VAT, ARSP, USD/CDF) are
// recomputed SERVER-SIDE from the items + the kind's mode — the client's numbers are
// never trusted. Mode is derived from the kind name (EXPORT → ED; DEFINIT → Import
// Definitive) and the customs section is the category flagged is_customs.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotations, quotationItems, quotationCategoryMaster, clients, kindMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildQuotation, quotationBodySchema } from '@/lib/quotations/compute';
import { cardCondition } from '@/lib/quotations/cardConditions';
import type { SQL } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const card = new URL(req.url).searchParams.get('card');
  const conditions: SQL[] = [eq(quotations.display, 'Y')];
  if (card) {
    const cond = cardCondition(card);
    if (cond) conditions.push(cond);
  }

  const rows = await db
    .select({
      id: quotations.id,
      quotation_ref: quotations.quotationRef,
      client_id: quotations.clientId,
      client_code: clients.shortName,
      quotation_date: quotations.quotationDate,
      kind_id: quotations.kindId,
      kind_name: kindMaster.kindName,
      total_amount: quotations.totalAmount,
      total_amount_cdf: quotations.totalAmountCdf,
      display: quotations.display,
    })
    .from(quotations)
    .leftJoin(clients, eq(clients.id, quotations.clientId))
    .leftJoin(kindMaster, eq(kindMaster.id, quotations.kindId))
    .where(and(...conditions))
    .orderBy(desc(quotations.id));

  return ok(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const parsed = quotationBodySchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  const input = parsed.data;

  if (input.items.length === 0) return fail('At least one item is required', 422);

  // Resolve mode + customs categories, then compute authoritative totals.
  const [kind] = input.kind_id
    ? await db.select({ name: kindMaster.kindName }).from(kindMaster).where(eq(kindMaster.id, input.kind_id))
    : [{ name: '' }];
  const catIds = [...new Set(input.items.map((i) => i.category_id).filter((v): v is number => !!v))];
  const cats = catIds.length
    ? await db.select({ id: quotationCategoryMaster.id, isCustoms: quotationCategoryMaster.isCustoms })
        .from(quotationCategoryMaster).where(inArray(quotationCategoryMaster.id, catIds))
    : [];
  const customsByCat = new Map(cats.map((c) => [c.id, c.isCustoms]));

  const { header, items } = buildQuotation(input, kind?.name ?? '', customsByCat);

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quotations)
        .values({ ...header, display: 'Y', createdBy: session.uid, updatedBy: session.uid })
        .returning({ id: quotations.id });

      for (const it of items) {
        await tx.insert(quotationItems).values({
          ...it, quotationId: row.id, display: 'Y', createdBy: session.uid, updatedBy: session.uid,
        });
      }

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: 'quotation',
        entityId: String(row.id),
        after: { ...header, items: items.length },
        metadata: { ref: header.quotationRef },
      });
      return row.id;
    });
    return ok({ id }, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'quotation reference');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[quotations.POST]', err);
    return fail('Server error', 500);
  }
}
