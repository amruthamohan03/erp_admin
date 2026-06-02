// GET ?page_id=...  returns the full matrix (roles × accordions → permission)
//   so the admin UI can draw a single grid for one page.
// PUT ?page_id=...  body: { grants: Record<"accordion_id:role_id", 'view'|'edit'|null> }
//   reconciles the matrix in one transaction:
//     * Non-null cells become inserts/updates against master_page_accordion_role.
//     * Null cells (or missing keys) become deletes.
//
// All work is scoped to accordions of the given page so admins can't accidentally
// touch grants on a different page through this endpoint.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  masterPageAccordion,
  masterPageAccordionRole,
  roleMaster,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const pageIdRaw = searchParams.get('page_id');
  if (!pageIdRaw) return fail('page_id is required', 400);
  const pageId = Number(pageIdRaw);
  if (Number.isNaN(pageId)) return fail('Invalid page_id', 400);

  // Accordions on this page, ordered.
  const accordions = await db
    .select({
      id: masterPageAccordion.id,
      slug: masterPageAccordion.slug,
      title: masterPageAccordion.title,
      display_order: masterPageAccordion.displayOrder,
    })
    .from(masterPageAccordion)
    .where(eq(masterPageAccordion.pageId, pageId))
    .orderBy(asc(masterPageAccordion.displayOrder), asc(masterPageAccordion.id));

  // Active roles, alphabetized.
  const roles = await db
    .select({
      id: roleMaster.id,
      role_name: roleMaster.roleName,
    })
    .from(roleMaster)
    .where(eq(roleMaster.display, 'Y'))
    .orderBy(asc(roleMaster.roleName));

  // Existing grants for accordions on this page.
  const accordionIds = accordions.map((a) => a.id);
  const grantRows =
    accordionIds.length === 0
      ? []
      : await db
          .select({
            accordion_id: masterPageAccordionRole.accordionId,
            role_id: masterPageAccordionRole.roleId,
            permission: masterPageAccordionRole.permission,
          })
          .from(masterPageAccordionRole)
          .where(inArray(masterPageAccordionRole.accordionId, accordionIds));

  const grants: Record<string, 'view' | 'edit'> = {};
  for (const g of grantRows) {
    grants[`${g.accordion_id}:${g.role_id}`] = g.permission as 'view' | 'edit';
  }

  return ok({ accordions, roles, grants });
}

const putSchema = z.object({
  // Map of "accordion_id:role_id" → 'view' | 'edit' | null (null = remove grant).
  grants: z.record(z.string(), z.union([z.literal('view'), z.literal('edit'), z.null()])),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const pageIdRaw = searchParams.get('page_id');
  if (!pageIdRaw) return fail('page_id is required', 400);
  const pageId = Number(pageIdRaw);
  if (Number.isNaN(pageId)) return fail('Invalid page_id', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON', 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });

  // Look up which accordions belong to this page (server-side whitelist).
  const accordions = await db
    .select({ id: masterPageAccordion.id })
    .from(masterPageAccordion)
    .where(eq(masterPageAccordion.pageId, pageId));
  const validAccordionIds = new Set(accordions.map((a) => a.id));

  // Parse and validate each "accordion_id:role_id" key.
  type Op = { accordionId: number; roleId: number; permission: 'view' | 'edit' | null };
  const ops: Op[] = [];
  for (const [key, value] of Object.entries(parsed.data.grants)) {
    const [accIdStr, roleIdStr] = key.split(':');
    const accordionId = Number(accIdStr);
    const roleId = Number(roleIdStr);
    if (Number.isNaN(accordionId) || Number.isNaN(roleId)) {
      return fail(`Invalid grant key '${key}' — expected '<accordion_id>:<role_id>'`, 422);
    }
    if (!validAccordionIds.has(accordionId)) {
      return fail(`accordion_id ${accordionId} does not belong to page ${pageId}`, 422);
    }
    ops.push({ accordionId, roleId, permission: value });
  }

  // Reconcile in a single transaction so admins don't end up with half-applied
  // matrices on a partial failure.
  await db.transaction(async (tx) => {
    for (const op of ops) {
      if (op.permission === null) {
        await tx
          .delete(masterPageAccordionRole)
          .where(
            and(
              eq(masterPageAccordionRole.accordionId, op.accordionId),
              eq(masterPageAccordionRole.roleId, op.roleId),
            ),
          );
      } else {
        // Upsert against the unique (accordion_id, role_id) index from 0039.
        await tx
          .insert(masterPageAccordionRole)
          .values({
            accordionId: op.accordionId,
            roleId: op.roleId,
            permission: op.permission,
            createdBy: session.uid,
            updatedBy: session.uid,
          })
          .onConflictDoUpdate({
            target: [masterPageAccordionRole.accordionId, masterPageAccordionRole.roleId],
            set: {
              permission: op.permission,
              updatedBy: session.uid,
              updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
            },
          });
      }
    }
  });

  return ok({ saved: ops.length });
}
