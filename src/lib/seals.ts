// Seal subsystem constants + pure helpers. Both the API routes (which
// derive total_seal on batch create) and the UI (preview while typing
// the amount) consume these.

// Fixed unit price per seal in the operating currency. Stays as code
// today; if this ever needs to vary by office / time / supplier it
// becomes a tax_rule_master_t formula keyed by 'seals.unit_price' so
// the existing rule engine can compose it.
export const SEAL_UNIT_PRICE = 10;

export const SEAL_STATUSES = ['Available', 'Used', 'Damaged'] as const;
export type SealStatusValue = (typeof SEAL_STATUSES)[number];

/**
 * Compute how many physical seals a batch of `totalAmount` buys at the
 * fixed unit price. Negative / non-finite / zero inputs return 0 — a
 * batch with $0 spent has no seals.
 */
export function computeTotalSeal(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.floor(totalAmount / SEAL_UNIT_PRICE);
}

/**
 * An office is "low on seals" when it has fewer than this many Available.
 *
 * Ten is one standard batch: SEAL_UNIT_PRICE is $10 and offices buy in $100
 * lots, so below this an office has less than one purchase left on the shelf
 * and should reorder before the next run of export files. Nothing in the
 * masters carries a stock threshold today; like the unit price above, it stays
 * a constant until it needs to vary per office.
 */
// TODO(config): move to a per-office threshold on main_office_master_t if offices start to differ.
export const SEAL_LOW_STOCK_THRESHOLD = 10;
