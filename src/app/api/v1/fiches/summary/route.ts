// §2 step 3 — GET /api/v1/fiches/summary: the workflow the fiche list renders
// its stat cards and row buttons from, and the live count in each state.
// Neither the states nor the steps are known to the screen in advance (§4.6).
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheStateCounts, ficheWorkflow } from '@/db/queries/fiches';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  const [workflow, counts] = await Promise.all([ficheWorkflow(), ficheStateCounts()]);
  return ok({ workflow, counts });
});
