import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { taxRuleMaster } from '@/db/schema';

// GET /api/v1/tax-rules
// List active tax_rule_master_t rows for the Fiche de Calcul rule picker.
// Returns the keys + names + scopes only — the formula stays server-side,
// kept off the wire so an admin UI can't accidentally leak business logic
// to non-admin users.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const rows = await db
    .select({
      id: taxRuleMaster.id,
      ruleKey: taxRuleMaster.ruleKey,
      name: taxRuleMaster.name,
      description: taxRuleMaster.description,
      jurisdiction: taxRuleMaster.jurisdiction,
      scope: taxRuleMaster.scope,
      displayOrder: taxRuleMaster.displayOrder,
    })
    .from(taxRuleMaster)
    .where(and(eq(taxRuleMaster.display, 'Y')))
    .orderBy(asc(taxRuleMaster.displayOrder), asc(taxRuleMaster.name));

  return ok(rows);
});
