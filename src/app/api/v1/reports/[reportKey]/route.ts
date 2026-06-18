import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadReportDefinition } from '@/lib/reports';

// GET /api/v1/reports/{reportKey}
// Returns the report's display metadata + the formKey to render its
// parameter form (or null). Used by the runner page before any execution.
//
// Errors:
//   401 — unauthenticated
//   404 — report definition missing or display='N'

type Ctx = { params: Promise<{ reportKey: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { reportKey } = await params;
  const definition = await loadReportDefinition(reportKey);
  return ok(definition);
});
