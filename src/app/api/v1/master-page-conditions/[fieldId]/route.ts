// PUT /api/v1/master-page-conditions/{fieldId} { key, predicate | null }
// Set one rule (visibleWhen / requiredWhen / readonlyWhen) on one field, or
// clear it with null. Other keys of the field's conditions are kept. Audited.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { fieldConditionUpdateSchema, fieldIdSchema } from '@/schemas';
import { setFieldCondition } from '@/db/queries/pageConditions';

type Ctx = { params: Promise<{ fieldId: string }> };

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/masters/pages', 'edit');
  if (isResponse(session)) return session;
  const fieldId = fieldIdSchema.parse((await params).fieldId);
  const body = fieldConditionUpdateSchema.parse(await req.json());
  await setFieldCondition(fieldId, body.key, body.predicate, session.uid);
  return ok({ id: fieldId });
});
