// GET /api/v1/master-page-conditions/values?page_id=&field=
// The distinct values a text / number / date field holds on that page's
// records — the Value dropdown of the Conditions tab for a field that has no
// option list of its own. (A dropdown field's options come from its own source.)
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { fieldValuesQuerySchema } from '@/schemas';
import { fieldRecordedValues } from '@/db/queries/pageConditions';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/masters/pages', 'view');
  if (isResponse(session)) return session;
  const q = fieldValuesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await fieldRecordedValues(q.page_id, q.field));
});
