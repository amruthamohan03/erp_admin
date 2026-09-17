// The shape a quotation line takes on the FORM, shared by the grid and the
// server hook that persists it.
//
// Its own leaf module, deliberately. The natural home would be beside the
// queries that read and write these rows, but the browser needs the type too
// and `db/queries/*` reaches the pg Pool — and a type-only import is erased
// today only for as long as nobody drops the `type` keyword, which is a
// build-breaking edit with no local symptom. A pure module cannot be broken
// that way.

/**
 * A priced line as the operator is editing it.
 *
 * The numbers are STRINGS, and that is the point: an empty box is not zero. A
 * quantity nobody has typed round-trips as `''` and renders as a placeholder;
 * storing it as `0` would put a figure in front of the operator that they did
 * not enter and make "not filled in yet" impossible to express. `compute.ts`
 * coerces once, at the boundary.
 */
export interface QuotationLine {
  category_id: number | null;
  item_id: number | null;
  unit_id: number | null;
  currency_id: number | null;
  has_tva: boolean;
  quantity: string;
  cost_usd: string;
  taux_usd: string;
  cif_split: string;
  percentage: string;
  rate_cdf: string;
}

/** An empty line for a category — every numeric box starts blank, never 0.00. */
export function emptyQuotationLine(categoryId: number): QuotationLine {
  return {
    category_id: categoryId,
    item_id: null,
    unit_id: null,
    currency_id: null,
    has_tva: false,
    quantity: '',
    cost_usd: '',
    taux_usd: '',
    cif_split: '',
    percentage: '',
    rate_cdf: '',
  };
}
