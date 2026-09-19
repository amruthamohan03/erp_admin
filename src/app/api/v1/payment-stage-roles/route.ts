// §4.7 — who may act on each Payment Request approval stage, per location.
//
// GET  ?location_id=   (blank = the "all locations" scope)
//      → the active stages, every active role, and the grants in that scope.
// PUT  { location_id, grants[] }
//      → replaces that scope's grants for the ACTIVE stages with exactly the
//        ones sent, in one transaction. The screen sends the whole matrix it
//        shows, so a toggle turned off is removed rather than left behind — and
//        a stage switched off in Payment Stages (so not on the screen) keeps its
//        grants for the day it is switched back on.
import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentStageRole, roleMaster } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { checkPermission } from '@/lib/auth/permissions';
import { BadRequestError } from '@/lib/errors';
import { paymentStageRolePutSchema } from '@/schemas';
import { loadPaymentStages } from '@/db/queries/paymentStages';
import { recordAudit } from '@/lib/audit/recordAudit';

function scopeOf(raw: string | null): number | null {
  if (raw == null || raw === '' || raw === '0') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError('Choose a location, or All Locations.');
  return n;
}

const scopeWhere = (locationId: number | null) =>
  locationId == null ? isNull(paymentStageRole.locationId) : eq(paymentStageRole.locationId, locationId);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const locationId = scopeOf(new URL(req.url).searchParams.get('location_id'));

  const [stages, roles, grants] = await Promise.all([
    loadPaymentStages(),
    db
      .select({ id: roleMaster.id, role_name: roleMaster.roleName })
      .from(roleMaster)
      .where(eq(roleMaster.display, 'Y'))
      .orderBy(asc(roleMaster.id)),
    db
      .select({ role_id: paymentStageRole.roleId, stage: paymentStageRole.stage })
      .from(paymentStageRole)
      .where(and(scopeWhere(locationId), eq(paymentStageRole.display, 'Y'))),
  ]);

  return ok({ location_id: locationId, stages, roles, grants });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  if (!(await checkPermission(session, '/mapping/roletopaymentstage', 'edit'))) {
    return fail('Your role may not change approval grants — ask for Edit on Role Payment Stage Mapping under Role Menu Mapping.', 403);
  }

  const { location_id, grants } = paymentStageRolePutSchema.parse(await req.json());
  const active = (await loadPaymentStages()).map((st) => st.stage);
  const unique = [...new Map(grants.map((g) => [`${g.role_id}:${g.stage}`, g])).values()].filter((g) =>
    active.includes(g.stage),
  );
  const scoped = and(scopeWhere(location_id), inArray(paymentStageRole.stage, active));

  try {
    await db.transaction(async (tx) => {
      const before = await tx
        .select({ role_id: paymentStageRole.roleId, stage: paymentStageRole.stage })
        .from(paymentStageRole)
        .where(scoped);
      await tx.delete(paymentStageRole).where(scoped);
      if (unique.length > 0) {
        await tx.insert(paymentStageRole).values(
          unique.map((g) => ({
            stage: g.stage,
            roleId: g.role_id,
            locationId: location_id,
            createdBy: session.uid,
            updatedBy: session.uid,
          })),
        );
      }
      // §4.28 — a permission change, logged with the whole scope before and after.
      await recordAudit(tx, {
        actorId: session.uid,
        action: 'permission_change',
        entityType: 'payment-stage-role',
        entityId: location_id == null ? 'all-locations' : String(location_id),
        before: { grants: before },
        after: { grants: unique },
      });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('A role or location in this matrix no longer exists — reload the page and try again.');
    }
    throw err;
  }

  return ok({ location_id, granted: unique.length });
});
