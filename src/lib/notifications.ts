import {
  notificationOutbox,
  type NotificationOutboxInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';
import type { SideEffectDescriptor } from '@/engine/workflow';

// Outbox-pattern helper for workflow side effects.
//
// case-runtime's advanceCase calls enqueueNotifications inside the same
// transaction that writes the entity update. Either both rows land or
// neither does — no risk of a state advance that "forgot" to notify, and
// no risk of a notify firing for an advance that rolled back.
//
// A separate dispatcher worker (future slice) polls
// `status = 'pending'` rows, sends them via the configured provider
// (email/SMS/in-app), and bumps the row to `sent` or `failed`.

export interface EnqueueOptions {
  templateKey?: string;
  caseId?: number;
}

/**
 * Persist every notify descriptor as a notification_outbox_t row. Skips
 * non-notify descriptors so callers can pass `ExecutedTransition.sideEffects`
 * directly. No-op when the array is empty.
 */
export async function enqueueNotifications(
  db: Database | Transaction,
  sideEffects: ReadonlyArray<SideEffectDescriptor>,
  options: EnqueueOptions = {},
): Promise<void> {
  const notifies = sideEffects.filter((s) => s.type === 'notify');
  if (notifies.length === 0) return;

  const rows: NotificationOutboxInsert[] = notifies.map((s) => ({
    channel: s.channel,
    // The `to` field on a notify action_json is a JSON Logic expression
    // (e.g. { var: 'entity.client_email' }) which the workflow engine
    // already resolved against the rule context — so it's a concrete
    // value here, not an expression. Coerce to string for the column.
    recipient: stringifyRecipient(s.to),
    template: s.template,
    templateKey: options.templateKey ?? null,
    caseId: options.caseId ?? null,
    status: 'pending',
  }));

  await db.insert(notificationOutbox).values(rows);
}

function stringifyRecipient(to: unknown): string {
  if (to == null) return '';
  if (typeof to === 'string') return to;
  if (typeof to === 'number' || typeof to === 'boolean') return String(to);
  // Numeric user ids serialised by the dispatcher into the right address;
  // arrays of recipients (CC, BCC) stringify to JSON for the worker to
  // parse later. Either way the column holds a deterministic representation.
  return JSON.stringify(to);
}
