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
function detectKind(kindName: string): {
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
  const { isExport, isImportDefinitive } = detectKind(kindName);
  const arspEnabled = input.arsp === 'Enabled';

  let subUsd = 0;
  let vatUsd = 0;
  let subCdf = 0;
  let vatCdf = 0;
  let arspBase = 0;

  const items: QuotationItemValues[] = [];

  for (const it of input.items) {
    if (!it.item_id) continue; // skip empty rows (no description chosen)
    const isCustoms = it.category_id
      ? !!customsByCat.get(it.category_id)
      : false;

    const common = {
      categoryId: it.category_id ?? null,
      itemId: it.item_id ?? null,
      unitId: it.unit_id ?? null,
      currencyId: it.currency_id ?? null,
      hasTva: !!it.has_tva,
    };

    if (isImportDefinitive && isCustoms) {
      const rate = num(it.rate_cdf);
      const vat = round2(rate * VAT_RATE);
      items.push({
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
      });
      subCdf += rate;
      vatCdf += vat;
    } else if (isExport) {
      const cost = num(it.cost_usd);
      const tva = common.hasTva ? round2(cost * VAT_RATE) : 0;
      items.push({
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
      });
      subUsd += cost;
      vatUsd += tva;
      if (common.hasTva) arspBase += cost;
    } else {
      const qty = num(it.quantity);
      const taux = num(it.taux_usd);
      const line = qty * taux;
      const tva = common.hasTva ? round2(line * VAT_RATE) : 0;
      items.push({
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
      });
      subUsd += line;
      vatUsd += tva;
      if (common.hasTva) arspBase += line;
    }
  }

  const arspAmount = arspEnabled ? round2(arspBase * ARSP_RATE) : 0;
  const totalUsd = subUsd + vatUsd + arspAmount;
  const totalCdf = subCdf + vatCdf;

  const header: QuotationHeaderValues = {
    clientId: input.client_id,
    quotationRef: input.quotation_ref,
    quotationDate: input.quotation_date ?? null,
    subTotal: dec(subUsd),
    vatAmount: dec(vatUsd),
    arspAmount: dec(arspAmount),
    totalAmount: dec(totalUsd),
    subTotalCdf: dec(subCdf),
    vatAmountCdf: dec(vatCdf),
    totalAmountCdf: dec(totalCdf),
    arsp: input.arsp ?? 'Disabled',
    kindId: input.kind_id ?? null,
    transportModeId: input.transport_mode_id ?? null,
    goodsTypeId: input.goods_type_id ?? null,
  };

  return { header, items };
}

// Internal constants exported for tests so the suite catches if someone
// silently changes the rate without updating the test fixtures.
export const __TEST__ = { VAT_RATE, ARSP_RATE };
