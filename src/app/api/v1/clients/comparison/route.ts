// GET /api/v1/clients/comparison — the Client Comparison dashboard (§4.29).
//
// The four comparisons (period, client, direction, office) share one engine;
// this route only names what the Clients module measures.
import type { NextRequest } from 'next/server';
import { isResponse, ok, requirePermission, withErrorHandler } from '@/lib/api';
import { runComparison } from '@/db/queries/comparisonEngine';
import { clientsComparison } from '@/db/queries/comparison/clientsComparison';
import { comparisonQuerySchema } from '@/schemas/comparison';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/clients/comparison', 'view');
  if (isResponse(session)) return session;
  const sp = new URL(req.url).searchParams;
  const q = comparisonQuerySchema.parse(Object.fromEntries(sp.entries()));
  return ok(await runComparison(clientsComparison, q, q.mode));
});
