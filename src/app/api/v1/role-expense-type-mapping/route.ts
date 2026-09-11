import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenseTypeMaster, roleExpenseTypeMapping, roleMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { roleExpenseTypeMappingPutSchema } from '@/schemas';

// §4.1 — which expense types a role may file a Payment Request against.
// The expense type decides which MCA references are claimable (one-to-one), so
// this is the master row behind "who may spend against what".

// GET /api/v1/role-expense-type-mapping?role_id=N
// Every active expense type joined with the role's mapping row (if any).
// Types with no row surface as is_allowed=false so the matrix UI works.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const roleIdParam = searchParams.get('role_id');
  if (!roleIdParam) throw new BadRequestError('Select a role to see its expense types.');
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    throw new BadRequestError('Select a role to see its expense types.');
  }

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')))
    .limit(1);
  if (!role) throw new NotFoundError('That role no longer exists.');

  const rows = await db
    .select({
      expense_type_id: expenseTypeMaster.id,
      expense_type_name: expenseTypeMaster.expenseTypeName,
      is_import: expenseTypeMaster.isImport,
      is_export: expenseTypeMaster.isExport,
      is_local: expenseTypeMaster.isLocal,
      is_advance: expenseTypeMaster.isAdvance,
      is_other: expenseTypeMaster.isOther,
      is_allowed: roleExpenseTypeMapping.isAllowed,
    })
    .from(expenseTypeMaster)
    .leftJoin(
      roleExpenseTypeMapping,
      and(
        eq(roleExpenseTypeMapping.expenseTypeId, expenseTypeMaster.id),
        eq(roleExpenseTypeMapping.roleId, roleId),
      ),
    )
    .where(eq(expenseTypeMaster.display, 'Y'))
    .orderBy(asc(expenseTypeMaster.id));

  const expense_types = rows.map((r) => ({ ...r, is_allowed: r.is_allowed ?? false }));

  return ok({
    role_id: roleId,
    // A role with no allowed type is UNRESTRICTED, not locked out — restriction
    // is opt-in, so an empty table on the day this ships changes nothing for
    // anyone. The screen says so rather than leaving the operator to infer it.
    unrestricted: expense_types.every((r) => !r.is_allowed),
    expense_types,
  });
});

// PUT /api/v1/role-expense-type-mapping
// Bulk upsert for one role. Rows turned off are DELETED rather than stored as
// is_allowed=false: "not allowed" and "no row" must not be two ways of saying
// the same thing, or `unrestricted` above would depend on which path cleared it.
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { role_id, mappings } = roleExpenseTypeMappingPutSchema.parse(await req.json());

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(eq(roleMaster.id, role_id))
    .limit(1);
  if (!role) throw new NotFoundError('That role no longer exists.');

  const keep = mappings.filter((m) => m.is_allowed);
  const drop = mappings.filter((m) => !m.is_allowed).map((m) => m.expense_type_id);

  try {
    await db.transaction(async (tx) => {
      if (drop.length > 0) {
        await tx
          .delete(roleExpenseTypeMapping)
          .where(
            and(
              eq(roleExpenseTypeMapping.roleId, role_id),
              inArray(roleExpenseTypeMapping.expenseTypeId, drop),
            ),
          );
      }

      if (keep.length === 0) return;

      await tx
        .insert(roleExpenseTypeMapping)
        .values(
          keep.map((m) => ({
            roleId: role_id,
            expenseTypeId: m.expense_type_id,
            isAllowed: true,
            createdBy: session.uid,
            updatedBy: session.uid,
          })),
        )
        .onConflictDoUpdate({
          target: [roleExpenseTypeMapping.roleId, roleExpenseTypeMapping.expenseTypeId],
          set: {
            isAllowed: sql`excluded.is_allowed`,
            updatedBy: session.uid,
            updatedAt: sql`now()`,
          },
        });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('That role or expense type no longer exists — reload the page and try again.');
    }
    throw err;
  }

  return ok({ role_id, allowed: keep.length, cleared: drop.length });
});
