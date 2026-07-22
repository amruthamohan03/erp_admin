import { NextRequest } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  quotations,
  quotationItems,
  clientMaster,
  kindMaster,
  transportModeMaster,
  typeOfGoodsMaster,
  quotationCategoryMaster,
  itemMaster,
  unitMaster,
  currencyMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildQuotation } from '@/lib/quotations/compute';
import { quotationBodySchema } from '@/schemas/quotations';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/quotations/{id}
// One quotation with header (joined for display names) + every line
// item with its master labels resolved. The UI's detail page renders
// from this single payload.

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [header] = await db
    .select({
      id: quotations.id,
      quotation_ref: quotations.quotationRef,
      quotation_date: quotations.quotationDate,
      client_id: quotations.clientId,
      client_name: clientMaster.companyName,
      kind_id: quotations.kindId,
      kind_name: kindMaster.kindName,
      transport_mode_id: quotations.transportModeId,
      transport_mode_name: transportModeMaster.transportModeName,
      goods_type_id: quotations.goodsTypeId,
      goods_type_name: typeOfGoodsMaster.goodsType,
      arsp: quotations.arsp,
      arsp_amount: quotations.arspAmount,
      sub_total: quotations.subTotal,
      vat_amount: quotations.vatAmount,
      total_amount: quotations.totalAmount,
      sub_total_cdf: quotations.subTotalCdf,
      vat_amount_cdf: quotations.vatAmountCdf,
      total_amount_cdf: quotations.totalAmountCdf,
      display: quotations.display,
      created_at: quotations.createdAt,
      updated_at: quotations.updatedAt,
    })
    .from(quotations)
    .leftJoin(clientMaster, eq(clientMaster.id, quotations.clientId))
    .leftJoin(kindMaster, eq(kindMaster.id, quotations.kindId))
    .leftJoin(
      transportModeMaster,
      eq(transportModeMaster.id, quotations.transportModeId),
    )
    .leftJoin(
      typeOfGoodsMaster,
      eq(typeOfGoodsMaster.id, quotations.goodsTypeId),
    )
    .where(eq(quotations.id, id))
    .limit(1);

  if (!header) throw new NotFoundError('Quotation not found');

  const items = await db
    .select({
      id: quotationItems.id,
      category_id: quotationItems.categoryId,
      category_name: quotationCategoryMaster.categoryName,
      category_header: quotationCategoryMaster.categoryHeader,
      category_display_order: quotationCategoryMaster.displayOrder,
      category_is_customs: quotationCategoryMaster.isCustoms,
      item_id: quotationItems.itemId,
      item_name: itemMaster.itemName,
      item_code: itemMaster.itemCode,
      quantity: quotationItems.quantity,
      unit_id: quotationItems.unitId,
      unit_name: unitMaster.unitName,
      unit_text: quotationItems.unitText,
      taux_usd: quotationItems.tauxUsd,
      cost_usd: quotationItems.costUsd,
      subtotal_usd: quotationItems.subtotalUsd,
      currency_id: quotationItems.currencyId,
      currency_short_name: currencyMaster.currencyShortName,
      has_tva: quotationItems.hasTva,
      tva_usd: quotationItems.tvaUsd,
      total_usd: quotationItems.totalUsd,
      cif_split: quotationItems.cifSplit,
      percentage: quotationItems.percentage,
      rate_cdf: quotationItems.rateCdf,
      vat_cdf: quotationItems.vatCdf,
      total_cdf: quotationItems.totalCdf,
    })
    .from(quotationItems)
    .leftJoin(
      quotationCategoryMaster,
      eq(quotationCategoryMaster.id, quotationItems.categoryId),
    )
    .leftJoin(itemMaster, eq(itemMaster.id, quotationItems.itemId))
    .leftJoin(unitMaster, eq(unitMaster.id, quotationItems.unitId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, quotationItems.currencyId))
    .where(
      and(
        eq(quotationItems.quotationId, id),
        eq(quotationItems.display, 'Y'),
      ),
    )
    .orderBy(
      asc(quotationCategoryMaster.displayOrder),
      asc(quotationItems.id),
    );

  return ok({ header, items });
});

// PUT /api/v1/quotations/{id}
// Replace-in-place update — recomputes header + every line via
// buildQuotation, then in one transaction: delete the existing items,
// update the header, insert the new items, audit. quotation_items_t
// rows don't get versioned individually; the quotation is the unit of
// edit.

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const body = quotationBodySchema.parse(await req.json());

  let kindName = '';
  if (body.kind_id) {
    const [kind] = await db
      .select({ kindName: kindMaster.kindName })
      .from(kindMaster)
      .where(eq(kindMaster.id, body.kind_id))
      .limit(1);
    if (!kind) throw new BadRequestError('Invalid kind_id');
    kindName = kind.kindName;
  }

  const customsRows = await db
    .select({ id: quotationCategoryMaster.id })
    .from(quotationCategoryMaster)
    .where(eq(quotationCategoryMaster.isCustoms, true));
  const customsByCat = new Map<number, boolean>(
    customsRows.map((r) => [r.id, true]),
  );

  const { header, items } = buildQuotation(body, kindName, customsByCat);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotations)
      .set({
        ...header,
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(quotations.id, id))
      .returning({ id: quotations.id });
    if (!row) return null;

    // Hard-delete the existing items then re-insert. CASCADE on the
    // header FK would also work, but this is more explicit + scoped.
    await tx
      .delete(quotationItems)
      .where(eq(quotationItems.quotationId, id));

    if (items.length > 0) {
      await tx.insert(quotationItems).values(
        items.map((it) => ({
          ...it,
          quotationId: id,
          createdBy: session.uid,
          updatedBy: session.uid,
        })),
      );
    }

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'quotation',
      entityId: String(id),
      after: { header, item_count: items.length },
    });

    return row.id;
  });

  if (!updated) throw new NotFoundError('Quotation not found');
  return ok({ id: updated });
});

// Soft-delete: flip display='N' on the header and cascade the same to
// the items. Partial unique index on quotation_ref WHERE display='Y'
// frees up the ref for reuse the moment the row is hidden.

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotations)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(quotations.id, id))
      .returning({ id: quotations.id });
    if (!row) return null;

    await tx
      .update(quotationItems)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(quotationItems.quotationId, id));

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'quotation',
      entityId: String(id),
    });

    return row.id;
  });

  if (!deleted) throw new NotFoundError('Quotation not found');
  return ok({ id: deleted });
});
