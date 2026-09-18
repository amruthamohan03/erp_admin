// §4.12 + §4.17 — the quotation transaction page's two halves: reading its
// line items back onto the form, and writing them with the header in ONE
// transaction.
//
// Why a hook rather than the generic runtime doing it: a quotation's lines live
// in `quotation_items_t`, a real child table, not a JSONB column. §4.5 makes
// that the exception rather than the rule and states the test — "reach for a
// child table only when the rows must be queried, filtered or reported on
// independently of their parent" — and these must be: the client-wise summary
// export groups line totals by category ACROSS quotations, and the invoice
// builder reads them to pull a quotation's items onto an invoice. Neither is
// answerable from JSONB on the parent.
//
// The consequence is that `items` is a VIRTUAL field: it has no column on
// `quotations_t`, so the runtime's column whitelist drops it from the patch and
// these functions carry it instead — the same shape as the export page's seal
// synchronisation, which is the other page-specific side effect in that route.
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import {
  kindMaster,
  quotationCategoryMaster,
  quotationItems,
  quotations,
} from '@/db/schema';
import {
  buildQuotation,
  lineMode,
  quotationBodySchema,
  quotationLinesProblem,
  type QuotationItemValues,
} from '@/lib/quotations/compute';
import { parseDerive, renderTemplate } from '@/lib/pages/derive';
import { getDeriveSource } from '@/lib/pages/deriveSources';
import type { QuotationLine } from '@/lib/quotations/line';

export type { QuotationLine };

const str = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
const id = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * A stored numeric column as the form should show it.
 *
 * `'0.00'` comes back for every column the line's mode does not use — see
 * `computeLine`, which zero-fills the unused set. Rendering those as a literal
 * 0.00 in the box would put a number in front of the operator that nobody
 * typed, so an exact zero reads as empty. A deliberate zero is not a value
 * anybody enters on a quotation line.
 */
const numeric = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) && n === 0 ? '' : str(v);
};

/** The quotation's lines, in the order the form renders them. */
export async function loadQuotationLines(quotationId: number): Promise<QuotationLine[]> {
  const rows = await db
    .select({
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
    .leftJoin(
      quotationCategoryMaster,
      eq(quotationCategoryMaster.id, quotationItems.categoryId),
    )
    .where(and(eq(quotationItems.quotationId, quotationId), eq(quotationItems.display, 'Y')))
    .orderBy(asc(quotationCategoryMaster.displayOrder), asc(quotationItems.id));

  return rows.map((r) => ({
    category_id: r.category_id,
    item_id: r.item_id,
    unit_id: r.unit_id,
    currency_id: r.currency_id,
    has_tva: !!r.has_tva,
    quantity: numeric(r.quantity),
    cost_usd: numeric(r.cost_usd),
    taux_usd: numeric(r.taux_usd),
    cif_split: numeric(r.cif_split),
    percentage: numeric(r.percentage),
    rate_cdf: numeric(r.rate_cdf),
  }));
}

/**
 * Lines out of whatever the form submitted.
 *
 * Tolerant on purpose: this is untrusted input arriving through a generic
 * runtime, and the authority on every figure is `buildQuotation`, which
 * recomputes from these raw entries. Anything unrecognisable becomes an empty
 * line, which `buildQuotation` then skips for having no item.
 */
export function parseQuotationLines(value: unknown): QuotationLine[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({
      category_id: id(l.category_id),
      item_id: id(l.item_id),
      unit_id: id(l.unit_id),
      currency_id: id(l.currency_id),
      has_tva: l.has_tva === true || l.has_tva === 'YES' || l.has_tva === 1,
      quantity: str(l.quantity),
      cost_usd: str(l.cost_usd),
      taux_usd: str(l.taux_usd),
      cif_split: str(l.cif_split),
      percentage: str(l.percentage),
      rate_cdf: str(l.rate_cdf),
    }));
}

/** The seven header columns the lines determine, keyed by DB column name. */
export interface QuotationComputed {
  columns: Record<string, string>;
  items: QuotationItemValues[];
  /**
   * Why these lines cannot be saved, or null — main's line rules, judged on the
   * lines AS SUBMITTED (see `quotationLinesProblem`). The caller refuses the
   * save on a non-null value; nothing here writes.
   */
  problem: string | null;
}

/**
 * Recompute the header totals and the stored lines from the submitted form.
 *
 * Every figure here is DERIVED — the operator types quantities and rates, never
 * a total — so these columns are written from the server's own arithmetic and a
 * submitted value for any of them is ignored. That is the same rule §4.12's
 * pure derives follow; this one just needs a database round trip (the kind's
 * name and which categories are customs) and so cannot be expressed as a
 * `derive` row.
 *
 * `ctx` is the page route's merged context: the stored row overlaid with this
 * submission, so changing the KIND on the header accordion re-costs every line
 * even when the grid itself was not touched.
 */
export async function computeQuotationSave(
  ctx: Record<string, unknown>,
  lines: QuotationLine[],
): Promise<QuotationComputed> {
  const kindId = id(ctx.kind_id);
  let kindName = '';
  if (kindId !== null) {
    const [kind] = await db
      .select({ kindName: kindMaster.kindName })
      .from(kindMaster)
      .where(eq(kindMaster.id, kindId))
      .limit(1);
    kindName = kind?.kindName ?? '';
  }

  // Which categories are customs is a MASTER FLAG, not a name match. main
  // tested `stripos(name, 'CUSTOMS')`, so renaming the category in French
  // silently moved every line onto the USD columns.
  const categoryRows = await db
    .select({
      id: quotationCategoryMaster.id,
      name: quotationCategoryMaster.categoryName,
      isCustoms: quotationCategoryMaster.isCustoms,
    })
    .from(quotationCategoryMaster);
  const customsByCat = new Map<number, boolean>(
    categoryRows.filter((r) => r.isCustoms).map((r) => [r.id, true]),
  );
  const nameByCat = new Map<number, string>(categoryRows.map((r) => [r.id, r.name ?? '']));

  const problem = quotationLinesProblem(
    lines,
    (cat) => lineMode(kindName, cat ? !!customsByCat.get(cat) : false),
    (cat) => (cat ? (nameByCat.get(cat) ?? '') : ''),
  );

  const body = quotationBodySchema.parse({
    client_id: ctx.client_id,
    quotation_ref: str(ctx.quotation_ref),
    quotation_date: ctx.quotation_date ? String(ctx.quotation_date).slice(0, 10) : null,
    kind_id: kindId,
    transport_mode_id: id(ctx.transport_mode_id),
    goods_type_id: id(ctx.goods_type_id),
    arsp: ctx.arsp === 'Enabled' ? 'Enabled' : 'Disabled',
    items: lines,
  });

  const { header, items } = buildQuotation(body, kindName, customsByCat);

  return {
    columns: {
      sub_total: String(header.subTotal),
      vat_amount: String(header.vatAmount),
      arsp_amount: String(header.arspAmount),
      total_amount: String(header.totalAmount),
      sub_total_cdf: String(header.subTotalCdf),
      vat_amount_cdf: String(header.vatAmountCdf),
      total_amount_cdf: String(header.totalAmountCdf),
    },
    items,
    problem,
  };
}

/**
 * The quotation's reference, rebuilt on the server from the pickers.
 *
 * The form fills it through the field's `template` derive, but an async derive
 * is not re-run on save — so without this a stale or tampered value would be
 * stored as-is. Resolved through the SAME source and the SAME configured
 * template, so the server cannot name a quotation differently from the screen.
 *
 * Null when a picker is still empty, exactly as the form blanks it.
 */
export async function quotationRefFor(
  values: Record<string, unknown>,
  deriveRaw: unknown,
): Promise<string | null> {
  const spec = parseDerive(deriveRaw);
  if (!spec || spec.kind !== 'template') return null;
  const source = getDeriveSource(spec.source);
  if (!source) return null;
  const tokens = await source.resolve(values, { entityId: null });
  if (!tokens) return null;
  const ref = renderTemplate(spec.template, tokens).trim();
  return ref || null;
}

/**
 * Whether another live quotation already carries this reference — main's
 * `checkRefUnique`. The record being edited is excluded; a deleted quotation
 * (`display = 'N'`) frees its reference, as it did in main.
 */
export async function quotationRefTaken(ref: string, selfId: number | null): Promise<boolean> {
  const [row] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(
      and(
        eq(quotations.quotationRef, ref),
        eq(quotations.display, 'Y'),
        selfId === null ? undefined : ne(quotations.id, selfId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Replace a quotation's lines wholesale, inside the caller's transaction.
 *
 * Delete-then-insert rather than a per-row diff, matching the dedicated PUT
 * route: the quotation is the unit of edit, individual lines carry no identity
 * an operator refers to, and a diff would have to invent one. It is a real
 * DELETE rather than `display = 'N'` for the same reason — a superseded line is
 * not a record anybody restores, and soft-deleting would make the export's
 * `GROUP BY category` double-count unless every reader remembered the filter.
 */
export async function replaceQuotationLines(
  tx: Transaction,
  quotationId: number,
  items: QuotationItemValues[],
  uid: number,
): Promise<void> {
  await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  if (items.length === 0) return;
  await tx.insert(quotationItems).values(
    items.map((it) => ({
      ...it,
      quotationId,
      display: 'Y' as const,
      createdBy: uid,
      updatedBy: uid,
    })),
  );
}

/**
 * Every item id a set of categories offers, for the grid's description pickers.
 *
 * Batched into one query rather than one per category: a quotation has four
 * categories today and the grid would otherwise open with four round trips.
 */
export async function categoryIdsInUse(ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: quotationCategoryMaster.id })
    .from(quotationCategoryMaster)
    .where(inArray(quotationCategoryMaster.id, [...ids]));
  return rows.map((r) => r.id);
}
