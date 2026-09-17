import { z } from 'zod';
import type { QuotationInsert, QuotationItemInsert } from '@/db/schema';

// Server-side quotation math — the single source of truth for line + header
// totals. Client-supplied numbers are recomputed here, never trusted: a
// malicious request can't ship totals that disagree with the line inputs.
//
// Three paths, picked per line:
//
//   1. Import-Definitive + customs category → CDF columns
//      rate_cdf is the operator-entered line value; VAT = rate × 16 %.
//      total_cdf = rate + vat. USD columns stay at '0'.
//
//   2. Export → cost_usd path
//      cost is the single per-line price (no qty/taux). VAT optional via
//      has_tva. ARSP base accumulates if has_tva.
//
//   3. Default (everything else, incl. Import-Definitive non-customs) →
//      qty × taux_usd. VAT optional via has_tva. ARSP base accumulates if
//      has_tva.
//
// Header totals:
//   total_amount     = sub_total + vat_amount + arsp_amount   (USD)
//   total_amount_cdf = sub_total_cdf + vat_amount_cdf         (CDF)

const VAT_RATE = 0.16;
const ARSP_RATE = 0.012;

// Kind name → behavior detector. main matched bare substrings on the
// uppercased name; that's fragile (renaming "Export" → "Sortie" silently
// flips the math) but identical to legacy behavior. The /masters/kinds
// admin page warns about this.
export function detectKind(kindName: string): {
  isExport: boolean;
  isImportDefinitive: boolean;
} {
  const k = (kindName || '').toUpperCase();
  return {
    isExport: k.includes('EXPORT'),
    // Matches both "DEFINITIVE" and main's legacy typo "DEFINITVE".
    isImportDefinitive: k.includes('DEFINIT'),
  };
}

/**
 * Which of the three column sets a line uses.
 *
 * Named, and decided in one place, because the CHOICE drives three things that
 * must agree: which columns the grid shows, which numbers the operator types,
 * and which columns get written. The grid asking this question separately from
 * the server is how a screen ends up showing USD while the row saves CDF.
 */
export type LineMode = 'cdf' | 'export' | 'standard';

export function lineMode(
  kindName: string,
  isCustomsCategory: boolean,
): LineMode {
  const { isExport, isImportDefinitive } = detectKind(kindName);
  // Import-Definitive only changes the CUSTOMS category; its other categories
  // stay on the standard qty × taux columns.
  if (isImportDefinitive && isCustomsCategory) return 'cdf';
  if (isExport) return 'export';
  return 'standard';
}

export const quotationItemSchema = z.object({
  category_id: z.coerce.number().int().positive().nullable().optional(),
  item_id: z.coerce.number().int().positive().nullable().optional(),
  unit_id: z.coerce.number().int().positive().nullable().optional(),
  currency_id: z.coerce.number().int().positive().nullable().optional(),
  has_tva: z.boolean().optional(),
  quantity: z.coerce.number().optional(),
  cost_usd: z.coerce.number().optional(),
  taux_usd: z.coerce.number().optional(),
  cif_split: z.coerce.number().optional(),
  percentage: z.coerce.number().optional(),
  rate_cdf: z.coerce.number().optional(),
});

export const quotationBodySchema = z.object({
  client_id: z.coerce.number().int().positive(),
  quotation_ref: z.string().min(1).max(255),
  quotation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .nullable()
    .optional(),
  kind_id: z.coerce.number().int().positive().nullable().optional(),
  transport_mode_id: z.coerce.number().int().positive().nullable().optional(),
  goods_type_id: z.coerce.number().int().positive().nullable().optional(),
  arsp: z.enum(['Enabled', 'Disabled']).optional(),
  items: z.array(quotationItemSchema),
});

export type QuotationBody = z.infer<typeof quotationBodySchema>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const dec = (n: number, scale = 2): string => n.toFixed(scale);

// Shapes returned by buildQuotation. Match the Drizzle insert types minus
// system columns the runtime fills in (id, display, audit). Callers wrap
// these in a transaction and add createdBy/updatedBy from the session.
export type QuotationHeaderValues = Omit<
  QuotationInsert,
  'id' | 'display' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;
export type QuotationItemValues = Omit<
  QuotationItemInsert,
  'id' | 'quotationId' | 'display' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

export interface BuildQuotationResult {
  header: QuotationHeaderValues;
  items: QuotationItemValues[];
}

/**
 * What one line contributes to the header totals, alongside its own columns.
 *
 * `arspBase` is separate from `subUsd` because ARSP is charged on the
 * VAT-eligible portion only — a line with `has_tva` off adds to the subtotal
 * but not to the ARSP base.
 */
export interface LineComputation {
  values: QuotationItemValues;
  subUsd: number;
  vatUsd: number;
  subCdf: number;
  vatCdf: number;
  arspBase: number;
}

/**
 * One line's stored columns and its contribution to the totals.
 *
 * Extracted from `buildQuotation` so the BROWSER can call it too: the items
 * grid needs each row's computed cells (TVA, line total) as the operator
 * types, and the summary needs the same running totals the server will store.
 * Re-deriving either in the UI is how a screen comes to show one number and
 * the database to hold another (§4.10) — this module is pure and its only
 * `@/db/schema` import is `import type`, so it costs the bundle nothing.
 *
 * The unused set of columns is written as '0' rather than left null, matching
 * main: a quotation line always has a full row, and a null there would be
 * indistinguishable from "not yet calculated".
 */
/**
 * A line loose enough for either caller.
 *
 * The SERVER hands over Zod-coerced numbers; the GRID hands over the raw
 * strings its inputs hold, because an empty box has to stay empty rather than
 * become a zero somebody has to delete. `num()` below flattens both, so the
 * parameter accepts both rather than forcing one side to convert first — the
 * conversion is this function's job and doing it twice is where they diverge.
 */
export interface ComputableLine {
  category_id?: number | null;
  item_id?: number | null;
  unit_id?: number | null;
  currency_id?: number | null;
  has_tva?: boolean;
  quantity?: string | number;
  cost_usd?: string | number;
  taux_usd?: string | number;
  cif_split?: string | number;
  percentage?: string | number;
  rate_cdf?: string | number;
}

export function computeLine(it: ComputableLine, mode: LineMode): LineComputation {
  const common = {
    categoryId: it.category_id ?? null,
    itemId: it.item_id ?? null,
    unitId: it.unit_id ?? null,
    currencyId: it.currency_id ?? null,
    hasTva: !!it.has_tva,
  };
  const zero = { subUsd: 0, vatUsd: 0, subCdf: 0, vatCdf: 0, arspBase: 0 };

  if (mode === 'cdf') {
    const rate = num(it.rate_cdf);
    const vat = round2(rate * VAT_RATE);
    return {
      ...zero,
      values: {
        ...common,
        quantity: '1',
        tauxUsd: '0',
        costUsd: '0',
        subtotalUsd: '0',
        tvaUsd: '0',
        totalUsd: '0',
        cifSplit: dec(num(it.cif_split)),
        percentage: dec(num(it.percentage), 4),
        rateCdf: dec(rate),
        vatCdf: dec(vat),
        totalCdf: dec(rate + vat),
      },
      subCdf: rate,
      vatCdf: vat,
    };
  }

  if (mode === 'export') {
    const cost = num(it.cost_usd);
    const tva = common.hasTva ? round2(cost * VAT_RATE) : 0;
    return {
      ...zero,
      values: {
        ...common,
        quantity: '1',
        costUsd: dec(cost),
        subtotalUsd: dec(cost),
        tauxUsd: '0',
        tvaUsd: dec(tva),
        totalUsd: dec(cost + tva),
        cifSplit: '0',
        percentage: '0',
        rateCdf: '0',
        vatCdf: '0',
        totalCdf: '0',
      },
      subUsd: cost,
      vatUsd: tva,
      arspBase: common.hasTva ? cost : 0,
    };
  }

  const qty = num(it.quantity);
  const taux = num(it.taux_usd);
  const line = qty * taux;
  const tva = common.hasTva ? round2(line * VAT_RATE) : 0;
  return {
    ...zero,
    values: {
      ...common,
      quantity: dec(qty),
      tauxUsd: dec(taux),
      costUsd: '0',
      subtotalUsd: '0',
      tvaUsd: dec(tva),
      totalUsd: dec(line + tva),
      cifSplit: '0',
      percentage: '0',
      rateCdf: '0',
      vatCdf: '0',
      totalCdf: '0',
    },
    subUsd: line,
    vatUsd: tva,
    arspBase: common.hasTva ? line : 0,
  };
}

/** The header figures, given what the lines contributed. Shared with the grid's summary. */
export function headerTotals(
  parts: readonly Pick<LineComputation, 'subUsd' | 'vatUsd' | 'subCdf' | 'vatCdf' | 'arspBase'>[],
  arspEnabled: boolean,
): {
  subUsd: number;
  vatUsd: number;
  arspAmount: number;
  totalUsd: number;
  subCdf: number;
  vatCdf: number;
  totalCdf: number;
} {
  let subUsd = 0;
  let vatUsd = 0;
  let subCdf = 0;
  let vatCdf = 0;
  let arspBase = 0;
  for (const p of parts) {
    subUsd += p.subUsd;
    vatUsd += p.vatUsd;
    subCdf += p.subCdf;
    vatCdf += p.vatCdf;
    arspBase += p.arspBase;
  }
  const arspAmount = arspEnabled ? round2(arspBase * ARSP_RATE) : 0;
  return {
    subUsd,
    vatUsd,
    arspAmount,
    totalUsd: subUsd + vatUsd + arspAmount,
    subCdf,
    vatCdf,
    totalCdf: subCdf + vatCdf,
  };
}

/**
 * Compose a quotation header + line items from the validated client body.
 *
 * @param input          — Zod-parsed quotation body
 * @param kindName       — the looked-up kind_master_t.kind_name (used for
 *                         path detection; pass '' if no kind selected)
 * @param customsByCat   — Map of category_id → is_customs flag, loaded
 *                         from quotation_category_master_t. Lines whose
 *                         category isn't in the map are treated as
 *                         non-customs.
 *
 * Empty rows (no item_id) are silently skipped so the UI can submit a
 * sparse table without zero-filling.
 */
export function buildQuotation(
  input: QuotationBody,
  kindName: string,
  customsByCat: Map<number, boolean>,
): BuildQuotationResult {
  // One pass through `computeLine`, then `headerTotals` — the same two
  // functions the items grid calls, so what the operator watched add up on
  // screen is arithmetically the row that gets stored.
  const parts: LineComputation[] = [];
  for (const it of input.items) {
    if (!it.item_id) continue; // skip empty rows (no description chosen)
    const isCustoms = it.category_id ? !!customsByCat.get(it.category_id) : false;
    parts.push(computeLine(it, lineMode(kindName, isCustoms)));
  }

  const t = headerTotals(parts, input.arsp === 'Enabled');

  const header: QuotationHeaderValues = {
    clientId: input.client_id,
    quotationRef: input.quotation_ref,
    quotationDate: input.quotation_date ?? null,
    subTotal: dec(t.subUsd),
    vatAmount: dec(t.vatUsd),
    arspAmount: dec(t.arspAmount),
    totalAmount: dec(t.totalUsd),
    subTotalCdf: dec(t.subCdf),
    vatAmountCdf: dec(t.vatCdf),
    totalAmountCdf: dec(t.totalCdf),
    arsp: input.arsp ?? 'Disabled',
    kindId: input.kind_id ?? null,
    transportModeId: input.transport_mode_id ?? null,
    goodsTypeId: input.goods_type_id ?? null,
  };

  return { header, items: parts.map((p) => p.values) };
}

// Internal constants exported for tests so the suite catches if someone
// silently changes the rate without updating the test fixtures.
export const __TEST__ = { VAT_RATE, ARSP_RATE };
