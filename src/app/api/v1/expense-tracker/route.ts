import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getExpenseTracker } from '@/db/queries/expenseTracker';
import { expenseTrackerQuerySchema } from '@/schemas';

// GET /api/v1/expense-tracker — per-file spend, revenue and profit (§4.29).
//
// Server-side paged: the three tracking tables together are well past the ~500
// rows §4.9 sets as the line, and the summary has to aggregate every matching
// file rather than the page, so the work belongs here either way.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = expenseTrackerQuerySchema.parse({
    module: searchParams.get('module') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    outcome: searchParams.get('outcome') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  const result = await getExpenseTracker({
    module: q.module,
    clientId: q.client_id ?? null,
    q: q.q ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
    outcome: q.outcome,
    page: q.page,
    pageSize: q.pageSize,
  });

  return ok(result.items, {
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      // The KPI row, aggregated over every matching file rather than the page.
      summary: result.summary,
    },
  });
});
