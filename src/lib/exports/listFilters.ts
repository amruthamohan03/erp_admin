// Shared server-side filter builder for the export Excel exports. Mirrors the
// /api/exports list filters (client/license/goods/transport/loading-date range +
// stat card) so a grouped export covers exactly the same scope as the on-screen
// list. Always pins display = 'Y'.
import { eq, gte, lte, type SQL } from 'drizzle-orm';
import { exports } from '@/db/schema';
import { cardCondition } from './cardConditions';

export function buildExportConditions(sp: URLSearchParams): SQL[] {
  const conditions: SQL[] = [eq(exports.display, 'Y')];

  const num = (k: string): number | null => {
    const v = sp.get(k);
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const date = (k: string): string | null => {
    const v = sp.get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };

  const clientId = num('client_id');
  if (clientId) conditions.push(eq(exports.clientId, clientId));
  const licenseId = num('license_id');
  if (licenseId) conditions.push(eq(exports.licenseId, licenseId));
  const goods = num('type_of_goods');
  if (goods) conditions.push(eq(exports.typeOfGoods, goods));
  const transport = num('transport_mode');
  if (transport) conditions.push(eq(exports.transportMode, transport));
  const start = date('start_date');
  if (start) conditions.push(gte(exports.loadingDate, start));
  const end = date('end_date');
  if (end) conditions.push(lte(exports.loadingDate, end));

  const card = sp.get('card');
  if (card) {
    const c = cardCondition(card);
    if (c) conditions.push(c);
  }

  return conditions;
}
