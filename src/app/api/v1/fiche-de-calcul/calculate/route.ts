import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { computeFiche } from '@/lib/ficheDeCalcul';
import { calculateFicheRequestSchema } from '@/schemas/fiche-de-calcul';
import { BadRequestError } from '@/lib/errors';

// POST /api/v1/fiche-de-calcul/calculate
// Run a list of tax_rule_master_t formulas against an entity context and
// return the per-rule breakdown + total. Pure read on the master tables;
// nothing is persisted.
//
// Body: { entity: { amount, ... }, ruleKeys: string[], asOf?: 'YYYY-MM-DD' }
// Errors:
//   400 — body invalid, ruleKeys empty
//   401 — unauthenticated
//   404 — one of the ruleKeys doesn't exist or isn't in effect on asOf

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = calculateFicheRequestSchema.parse(await req.json());

  let asOf: Date | undefined;
  if (body.asOf) {
    asOf = new Date(`${body.asOf}T00:00:00Z`);
    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestError('asOf must parse as a valid date');
    }
  }

  const result = await computeFiche({
    entity: body.entity,
    ruleKeys: body.ruleKeys,
    asOf,
  });
  return ok(result);
});
