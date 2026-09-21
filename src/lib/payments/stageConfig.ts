// The Payment Request approval chain as the runtime sees it — one StageDef per
// ACTIVE row of payment_stage_master_t, in run order (§4.1).
//
// Pure and dependency-free so the browser and the server read the same shape:
// the grid, the view modal and the approve route must agree on what a request is
// waiting for, and they can only do that by working from one definition.
import type { PaymentStage, PaymentStageTone } from '@/db/schema';
import { badgeClass, type ToneKey } from '@/lib/statusTone';

// The badge palette is the app-wide one (§4.38); re-exported so the payment
// screens keep their import.
export { badgeClass, type ToneKey };

export interface StageDef {
  stage: PaymentStage;
  label: string;
  pending_label: string;
  sort_order: number;
  /** null — every request; otherwise only requests of this payment type. */
  payment_type: 'Bank' | 'Cash' | null;
  captures_chargeback: boolean;
  requires_cash_collector: boolean;
  captures_documents: boolean;
  print_signature: boolean;
  tone: PaymentStageTone;
}

/**
 * The chain as migration 0103 seeds it — used only when the master is empty.
 *
 * A half-configured table must never stop requests being approved, and must
 * never quietly re-route them either, so an empty or unreadable master falls
 * back to exactly what the seed would have said (the same stance §4.33 takes
 * with MCA_REF_DEFAULTS).
 */
export const DEFAULT_STAGES: readonly StageDef[] = [
  { stage: 'dept', label: 'Department', pending_label: 'Pending Dept', sort_order: 10, payment_type: null, captures_chargeback: true, requires_cash_collector: false, captures_documents: false, print_signature: true, tone: 'amber' },
  { stage: 'finance', label: 'Finance', pending_label: 'Pending Finance', sort_order: 20, payment_type: null, captures_chargeback: false, requires_cash_collector: false, captures_documents: false, print_signature: true, tone: 'cyan' },
  { stage: 'management', label: 'Management', pending_label: 'Pending Mgmt', sort_order: 30, payment_type: null, captures_chargeback: false, requires_cash_collector: false, captures_documents: false, print_signature: true, tone: 'violet' },
  { stage: 'under_process', label: 'Under Process', pending_label: 'Under Process', sort_order: 40, payment_type: 'Bank', captures_chargeback: false, requires_cash_collector: false, captures_documents: false, print_signature: false, tone: 'sky' },
  { stage: 'paid', label: 'Paid', pending_label: 'Pending Payment', sort_order: 50, payment_type: null, captures_chargeback: false, requires_cash_collector: true, captures_documents: true, print_signature: false, tone: 'orange' },
];

/** The stages a request of this payment type actually passes through, in order. */
export function applicableStages(stages: readonly StageDef[], paymentType: string | null): StageDef[] {
  return stages.filter((s) => s.payment_type == null || s.payment_type === paymentType);
}

/** A stage's display name, falling back to the slot key for a stage not configured. */
export function stageLabel(stages: readonly StageDef[], stage: string): string {
  return stages.find((s) => s.stage === stage)?.label ?? stage.replace('_', ' ');
}

// ---- hues (§4.32 — both themes stated, never a bare palette shade) ----------

/** Solid mid-tone gradients for the stat cards — white type on a known ground (§4.32). */
const CARD: Partial<Record<ToneKey, string>> = {
  amber: 'from-amber-500 to-orange-500',
  cyan: 'from-cyan-500 to-sky-600',
  violet: 'from-violet-500 to-purple-600',
  sky: 'from-sky-500 to-blue-600',
  orange: 'from-orange-500 to-amber-600',
  blue: 'from-blue-500 to-indigo-600',
  teal: 'from-teal-500 to-emerald-600',
  fuchsia: 'from-fuchsia-500 to-pink-600',
  slate: 'from-slate-500 to-slate-700',
  emerald: 'from-emerald-500 to-teal-600',
  rose: 'from-rose-500 to-red-600',
  indigo: 'from-indigo-500 to-violet-600',
};

export const cardGradient = (tone: ToneKey): string => CARD[tone] ?? CARD.slate ?? '';

/** The fixed hues of the two terminal states — they are outcomes, not stages. */
export const DONE_TONE: ToneKey = 'emerald';
export const REJECTED_TONE: ToneKey = 'rose';
