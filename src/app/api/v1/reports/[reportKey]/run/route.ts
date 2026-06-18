import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { runReport } from '@/lib/reports';

// POST /api/v1/reports/{reportKey}/run
// Execute a report. Body shape:
//   { "params": { ... } }   — when the report has a parameter form
//   { }                     — for parameterless reports
//
// Errors:
//   400 — parameters fail validation against the linked form schema, or
//         params supplied for a parameterless report
//   401 — unauthenticated
//   404 — report definition missing, or no code-side handler wired up

const bodySchema = z
  .object({
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

type Ctx = { params: Promise<{ reportKey: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { reportKey } = await params;
  const parsed = bodySchema.parse(await req.json().catch(() => undefined));

  const result = await runReport({
    reportKey,
    params: parsed?.params,
  });
  return ok(result);
});
