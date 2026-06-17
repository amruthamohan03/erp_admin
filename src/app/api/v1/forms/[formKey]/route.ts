import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadForm } from '@/engine/forms';

// GET /api/v1/forms/{formKey}
// Returns the full form definition + ordered fields for client-side
// rendering via <DynamicForm>. Errors:
//   401 — unauthenticated
//   404 — form_key not in form_definition_master_t (or display='N')

type Ctx = { params: Promise<{ formKey: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { formKey } = await params;
  const form = await loadForm(formKey);
  return ok(form);
});
