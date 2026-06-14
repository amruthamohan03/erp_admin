// Server-only: maps a quotation dashboard-card key to the SQL condition that backs
// its count and the matching ?card= list filter. Kind classification is done by a
// subquery on kind_master_t (no join needed). Used by BOTH /api/quotations/stats
// and /api/quotations so a card's count and its filtered list always agree.
import { sql, type SQL } from 'drizzle-orm';
import { quotations } from '@/db/schema';

export const QUOTATION_CARD_KEYS = [
  'all',
  'import',
  'export',
  'definitive',
  'this_month',
] as const;

export type QuotationCardKey = (typeof QUOTATION_CARD_KEYS)[number];

export function cardCondition(key: string): SQL | null {
  switch (key) {
    case 'import':
      return sql`${quotations.kindId} IN (SELECT id FROM kind_master_t WHERE kind_name ILIKE '%IMPORT%')`;
    case 'export':
      return sql`${quotations.kindId} IN (SELECT id FROM kind_master_t WHERE kind_name ILIKE '%EXPORT%')`;
    case 'definitive':
      return sql`${quotations.kindId} IN (SELECT id FROM kind_master_t WHERE kind_name ILIKE '%DEFINIT%')`;
    case 'this_month':
      return sql`${quotations.quotationDate} >= date_trunc('month', CURRENT_DATE)`;
    case 'all':
    default:
      return null;
  }
}
