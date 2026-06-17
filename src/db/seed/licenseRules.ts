import { sql } from 'drizzle-orm';
import { ruleMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// JSON Logic rules used by the license workflow.
//
// Today there's one: `license.no_self_approve` — the user who created the
// license can't be the one who approves it. Attached to the approve
// transition in licenseWorkflow.ts; ForbiddenError if violated.

const rows = [
  {
    ruleKey: 'license.no_self_approve',
    name: 'License: no self-approval',
    description:
      'The user approving a license must not be the user who created it.',
    scope: 'workflow',
    ruleJson: {
      '!=': [{ var: 'actor.userId' }, { var: 'entity.created_by' }],
    },
  },
];

export async function seedLicenseRules(db: Database | Transaction): Promise<void> {
  await db
    .insert(ruleMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: ruleMaster.ruleKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        scope: sql`excluded.scope`,
        ruleJson: sql`excluded.rule_json`,
        updatedAt: sql`now()`,
      },
    });
}
