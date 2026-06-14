// Fixed unit price per seal. total_seal is derived as floor(total_amount / price).
// TODO(config): move to a master_feature_toggle / pricing master if it ever varies.
export const SEAL_UNIT_PRICE = 10;

export const SEAL_STATUSES = ['Available', 'Used', 'Damaged'] as const;
export type SealStatusValue = (typeof SEAL_STATUSES)[number];

export function computeTotalSeal(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.floor(totalAmount / SEAL_UNIT_PRICE);
}
