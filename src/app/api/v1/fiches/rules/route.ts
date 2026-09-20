// §2 step 3 / §4.2 — GET /api/v1/fiches/rules: the fiche formulas in effect
// today, from tax_rule_master_t. The items grid evaluates them to preview CIF
// and DDI with the same pure function the save route recomputes with, so the
// screen shows what will be stored.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { loadFicheRules } from '@/db/queries/fiches';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  return ok(await loadFicheRules());
});
