import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { hideDelayRule, updateDelayRule } from '@/db/queries/delayRules';
import { delayRuleUpdateSchema } from '@/schemas/delay-tracker';
import { ValidationError } from '@/lib/errors';

function idOf(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('That is not a delay rule id.');
  return id;
}

export const PUT = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id } = await ctx.params;
    const input = delayRuleUpdateSchema.parse(await req.json());
    return ok(await updateDelayRule(idOf(id), input, session.uid));
  },
);

// Soft delete (§4.27): the rule is hidden, and the module's default refuses to
// be hidden at all — every unmatched file is measured by it.
export const DELETE = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id } = await ctx.params;
    await hideDelayRule(idOf(id), session.uid);
    return ok({ id: idOf(id) });
  },
);
