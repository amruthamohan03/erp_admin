// POST /api/exports/bulk — set one or more whitelisted fields on many exports at
// once. Authorization reuses the §4.12 model: the caller's role must hold an
// 'edit' grant on the 'export' page (so the same roles that can edit the form can
// bulk-edit). Every row change is audited (§4.10) inside a single transaction.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPage, masterPageAccordion, masterPageAccordionRole } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { getPageTarget, safeColumnsFor, fetchEntityValues } from '@/lib/pages/targets';
import { recordAudit } from '@/lib/audit/recordAudit';
import { BULK_FIELD_NAMES } from '@/lib/exports/bulkFields';

const bodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(2000),
  values: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  }
  const { ids, values } = parsed.data;

  // Authorization: caller's role must have an 'edit' grant on the export page.
  const grant = await db
    .select({ id: masterPageAccordionRole.id })
    .from(masterPage)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.pageId, masterPage.id))
    .innerJoin(masterPageAccordionRole, eq(masterPageAccordionRole.accordionId, masterPageAccordion.id))
    .where(
      and(
        eq(masterPage.slug, 'export'),
        eq(masterPageAccordionRole.roleId, session.role_id),
        eq(masterPageAccordionRole.permission, 'edit'),
      ),
    )
    .limit(1);
  if (grant.length === 0) {
    return fail('Forbidden — your role cannot bulk-edit exports', 403);
  }

  // Restrict to (bulk whitelist ∩ real exports_t columns).
  const requested = Object.keys(values);
  const allowed = new Set(safeColumnsFor('export', BULK_FIELD_NAMES));
  const patch: Record<string, unknown> = {};
  for (const k of requested) {
    if (allowed.has(k)) {
      const v = values[k];
      patch[k] = v === '' ? null : v;
    }
  }
  const cols = Object.keys(patch);
  if (cols.length === 0) {
    return fail('No bulk-editable fields in payload', 422);
  }

  const target = getPageTarget('export');
  if (!target) return fail('Export page target not registered', 500);

  const updated = await db.transaction(async (tx) => {
    let n = 0;
    for (const id of ids) {
      const before = await fetchEntityValues('export', id, cols);
      if (!before) continue; // skip ids that don't exist

      const setEntries = cols.map((c) => sql`${sql.identifier(c)} = ${patch[c] ?? null}`);
      setEntries.push(sql`${sql.identifier('updated_by')} = ${session.uid}`);
      setEntries.push(sql`${sql.identifier('updated_at')} = CURRENT_TIMESTAMP`);
      await tx.execute(
        sql`UPDATE ${target.table} SET ${sql.join(setEntries, sql`, `)} WHERE id = ${id}`,
      );

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: 'page:export',
        entityId: String(id),
        before,
        after: patch,
        metadata: { accordion: 'bulk', fields: cols },
      });
      n += 1;
    }
    return n;
  });

  return ok({ updated, fields: cols });
}
