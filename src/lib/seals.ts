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
