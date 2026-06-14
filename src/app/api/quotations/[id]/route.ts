// Quotation detail / update / soft-delete. Detail returns the header + its line
// items (the page groups them by category). Update recomputes totals server-side
// and replaces the line items inside one transaction; delete is a soft-delete of
// the header + items. Every mutation is audited (§4.10).
import { NextRequest } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotations, quotationItems, quotationCategoryMaster, kindMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildQuotation, quotationBodySchema } from '@/lib/quotations/compute';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [quotation] = await db
    .select({
      id: quotations.id,
      client_id: quotations.clientId,
      quotation_ref: quotations.quotationRef,
      quotation_date: quotations.quotationDate,
      arsp: quotations.arsp,
      kind_id: quotations.kindId,
      transport_mode_id: quotations.transportModeId,
      goods_type_id: quotations.goodsTypeId,
      total_amount: quotations.totalAmount,
      total_amount_cdf: quotations.totalAmountCdf,
    })
    .from(quotations)
    .where(eq(quotations.id, id));
  if (!quotation) return fail('Quotation not found', 404);

  const items = await db
    .select({
      id: quotationItems.id,
      category_id: quotationItems.categoryId,
      item_id: quotationItems.itemId,
      unit_id: quotationItems.unitId,
      currency_id: quotationItems.currencyId,
      has_tva: quotationItems.hasTva,
      quantity: quotationItems.quantity,
      cost_usd: quotationItems.costUsd,
      taux_usd: quotationItems.tauxUsd,
      cif_split: quotationItems.cifSplit,
      percentage: quotationItems.percentage,
      rate_cdf: quotationItems.rateCdf,
    })
    .from(quotationItems)
    .where(and(eq(quotationItems.quotationId, id), eq(quotationItems.display, 'Y')));

  return ok({ quotation, items });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

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

  const [existing] = await db.select({ id: quotations.id }).from(quotations).where(eq(quotations.id, id));
  if (!existing) return fail('Quotation not found', 404);

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
    await db.transaction(async (tx) => {
      await tx
        .update(quotations)
        .set({ ...header, updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
        .where(eq(quotations.id, id));

      // Replace line items.
      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
      for (const it of items) {
        await tx.insert(quotationItems).values({
          ...it, quotationId: id, display: 'Y', createdBy: session.uid, updatedBy: session.uid,
        });
      }

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: 'quotation',
        entityId: String(id),
        after: { ...header, items: items.length },
        metadata: { ref: header.quotationRef },
      });
    });
    return ok({ id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'quotation reference');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[quotations.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotations)
      .set({ display: 'N', updatedBy: session.uid, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date })
      .where(eq(quotations.id, id))
      .returning({ id: quotations.id });
    if (!row) return null;

    await tx.update(quotationItems).set({ display: 'N' }).where(eq(quotationItems.quotationId, id));
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'quotation',
      entityId: String(id),
      metadata: {},
    });
    return row.id;
  });

  if (!deleted) return fail('Not found', 404);
  return ok({ id: deleted });
}
