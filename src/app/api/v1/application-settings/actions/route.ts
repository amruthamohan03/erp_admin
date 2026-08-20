// §4.26 — read and update the per-action colour/icon configuration.
//
// GET returns a complete set (missing rows fall back to defaults) so the settings
// screen always renders all sixteen actions. PUT upserts the submitted rows in one
// transaction and records an audit entry (§4.28 — application-settings changes are
// logged like any other consequential change).
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { actionStyleMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { loadActionStyles } from '@/db/queries/actionStyles';
import { actionStyleUpdateSchema } from '@/schemas';
import { recordAudit } from '@/lib/audit/recordAudit';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await loadActionStyles());
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const before = await loadActionStyles();
  const { actions } = actionStyleUpdateSchema.parse(await req.json());

  await db.transaction(async (tx) => {
    for (const a of actions) {
      await tx
        .insert(actionStyleMaster)
        .values({
          actionKey: a.action_key,
          label: a.label,
          color: a.color,
          icon: a.icon,
          createdBy: session.uid,
          updatedBy: session.uid,
        })
        .onConflictDoUpdate({
          target: actionStyleMaster.actionKey,
          set: {
            label: a.label,
            color: a.color,
            icon: a.icon,
            updatedBy: session.uid,
            updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
          },
        });
    }

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'application-settings:actions',
      entityId: 'singleton',
      before: Object.fromEntries(before.map((s) => [s.action_key, `${s.color} ${s.icon}`])),
      after: Object.fromEntries(actions.map((s) => [s.action_key, `${s.color} ${s.icon}`])),
    });
  });

  return ok(await loadActionStyles());
});
