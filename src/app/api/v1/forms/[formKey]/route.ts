import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadForm } from '@/engine/forms';
import {
  fetchFieldGrants,
  annotateVisibleFields,
} from '@/lib/formFieldGrants';

// GET /api/v1/forms/{formKey}
// Returns the form definition + ordered fields for client-side rendering
// via <DynamicForm>. Fields are filtered by field-level role grants
// (form_field_role_t): hidden fields are stripped from the response, and
// the remaining ones are annotated with permission ('view' | 'edit') so
// the renderer can disable read-only inputs without a second round trip.
//
// Errors:
//   401 — unauthenticated
//   404 — form_key not in form_definition_master_t (or display='N')

type Ctx = { params: Promise<{ formKey: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { formKey } = await params;
  const form = await loadForm(formKey);

  const grants = await fetchFieldGrants(
    form.fields.map((f) => f.id),
    session.role_id,
  );
  const fields = annotateVisibleFields(form.fields, grants);

  return ok({ ...form, fields });
});
