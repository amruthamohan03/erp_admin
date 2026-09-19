// §4.1 / §4.7 — reads the Payment Request approval chain's configuration.
//
// Two masters: payment_stage_master_t says what the chain IS, and
// payment_stage_role_master_t says who may act on each stage (optionally only at
// one location). Everything that approves, rejects, lists, counts or prints a
// request asks here rather than stating either itself.
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  PAYMENT_STAGES,
  PAYMENT_STAGE_TONES,
  paymentStageMaster,
  paymentStageRole,
  type PaymentStage,
  type PaymentStageTone,
} from '@/db/schema';
import { DEFAULT_STAGES, type StageDef } from '@/lib/payments/stageConfig';

const isStage = (v: string): v is PaymentStage => (PAYMENT_STAGES as readonly string[]).includes(v);
const isTone = (v: string): v is PaymentStageTone => (PAYMENT_STAGE_TONES as readonly string[]).includes(v);

type StageRow = typeof paymentStageMaster.$inferSelect;

export function toStageDef(r: StageRow): StageDef | null {
  if (!isStage(r.stage)) return null;
  return {
    stage: r.stage,
    label: r.label,
    pending_label: r.pendingLabel,
    sort_order: r.sortOrder,
    payment_type: r.paymentType === 'Bank' || r.paymentType === 'Cash' ? r.paymentType : null,
    captures_chargeback: r.capturesChargeback,
    requires_cash_collector: r.requiresCashCollector,
    captures_documents: r.capturesDocuments,
    print_signature: r.printSignature,
    tone: isTone(r.tone) ? r.tone : 'slate',
  };
}

/**
 * The ACTIVE chain, in run order.
 *
 * An empty master falls back to the seeded chain rather than to "no stages" —
 * with no stages every request would read as already complete, which is the one
 * failure that pays money nobody approved.
 */
export async function loadPaymentStages(): Promise<StageDef[]> {
  const rows = await db
    .select()
    .from(paymentStageMaster)
    .where(eq(paymentStageMaster.display, 'Y'))
    .orderBy(asc(paymentStageMaster.sortOrder), asc(paymentStageMaster.id));
  const defs = rows.map(toStageDef).filter((d): d is StageDef => d !== null);
  return defs.length > 0 ? defs : [...DEFAULT_STAGES];
}

// ---- who may act --------------------------------------------------------------

export interface StageGrant {
  stage: PaymentStage;
  /** null — every location. */
  location_id: number | null;
}

export interface RoleStageInfo {
  grants: StageGrant[];
  /** Holds at least one grant — sees the requests of the locations it approves for. */
  isApprover: boolean;
}

export async function getRoleStageInfo(roleId: number): Promise<RoleStageInfo> {
  const rows = await db
    .select({ stage: paymentStageRole.stage, location_id: paymentStageRole.locationId })
    .from(paymentStageRole)
    .where(and(eq(paymentStageRole.roleId, roleId), eq(paymentStageRole.display, 'Y')));
  const grants = rows.filter((r): r is StageGrant => isStage(r.stage));
  return { grants, isApprover: grants.length > 0 };
}

/** May this role act on `stage` for a request raised at `locationId`? */
export function canActOn(info: RoleStageInfo, stage: PaymentStage, locationId: number | null): boolean {
  return info.grants.some((g) => g.stage === stage && (g.location_id == null || g.location_id === locationId));
}

/**
 * Rows this user may see, against the `pr` alias: their own requests, plus
 * every request at a location one of their role's grants covers.
 */
export function visibilitySql(info: RoleStageInfo, userId: number) {
  if (!info.isApprover) return sql`pr.created_by = ${userId}`;
  if (info.grants.some((g) => g.location_id == null)) return sql`TRUE`;
  const locs = [...new Set(info.grants.map((g) => g.location_id as number))];
  return sql`(pr.created_by = ${userId} OR pr.location_id IN (${sql.join(locs.map((l) => sql`${l}`), sql`, `)}))`;
}
