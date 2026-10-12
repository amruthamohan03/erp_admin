import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { createDelayRule, dateFieldsFor, listDelayRules } from '@/db/queries/delayRules';
import { delayRuleCreateSchema } from '@/schemas/delay-tracker';

// Delay rules — what "late" means, as master data (§4.1).
//
// The GET ships the selectable date fields alongside the rules: the editor's
// pickers and the validator that checks a submitted field are then the same
// list, so a field cannot be offered that the server would reject.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  return ok({
    rules: await listDelayRules(true),
    fields: {
      import: dateFieldsFor('import'),
      export: dateFieldsFor('export'),
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const input = delayRuleCreateSchema.parse(await req.json());
  return ok(await createDelayRule(input, session.uid), 201);
});
