import { and, asc, eq, lt, sql } from 'drizzle-orm';
import {
  notificationOutbox,
  type NotificationOutboxInsert,
  type NotificationOutboxRow,
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
// A separate dispatcher worker (dispatchPendingNotifications below) polls
// `status = 'pending'` rows, sends them via a channel implementation, and
// bumps the row to `sent` or `failed` based on the result. Run it from a
// cron-like job or invoke scripts/dispatch-notifications.ts manually.

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

// --- Dispatcher ----------------------------------------------------------

export interface NotificationChannel {
  /** Throws on failure. The thrown error's message lands in last_error. */
  send(row: NotificationOutboxRow): Promise<void>;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BATCH_SIZE = 100;

export interface DispatchOptions {
  /** Map of channel name → handler. A row whose channel isn't here is skipped. */
  channels: Record<string, NotificationChannel>;
  /** Max rows to attempt this run. Default 100. */
  batchSize?: number;
  /**
   * Maximum attempts before a row is moved from pending → failed.
   * Default 5.
   */
  maxAttempts?: number;
}

export interface DispatchResult {
  /** Rows the dispatcher attempted to send (success or failure). */
  attempted: number;
  sent: number;
  /** Rows whose attempts reached maxAttempts. */
  failed: number;
  /** Rows whose channel isn't configured — left as pending for next run. */
  skipped: number;
  /** Rows that failed but haven't hit maxAttempts yet — stay pending. */
  retrying: number;
}

/**
 * Pick pending notifications, send each via the matching channel, then
 * update its status. Idempotent at the per-row level (retries hit the same
 * row in subsequent runs). Safe to call concurrently — each row UPDATE is
 * scoped by id so concurrent dispatchers compete on distinct rows.
 *
 * Returns counts of every outcome so the cron driver can log them.
 */
export async function dispatchPendingNotifications(
  db: Database,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const pending = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, 'pending'),
        lt(notificationOutbox.attempts, maxAttempts),
      ),
    )
    .orderBy(asc(notificationOutbox.id))
    .limit(batchSize);

  const result: DispatchResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retrying: 0,
  };

  for (const row of pending) {
    const channel = options.channels[row.channel];
    if (!channel) {
      result.skipped += 1;
      continue;
    }
    result.attempted += 1;
    try {
      await channel.send(row);
      await db
        .update(notificationOutbox)
        .set({
          status: 'sent',
          attempts: row.attempts + 1,
          lastAttemptAt: sql`now()`,
          lastError: null,
          updatedAt: sql`now()`,
        })
        .where(eq(notificationOutbox.id, row.id));
      result.sent += 1;
    } catch (err) {
      const newAttempts = row.attempts + 1;
      const giveUp = newAttempts >= maxAttempts;
      await db
        .update(notificationOutbox)
        .set({
          status: giveUp ? 'failed' : 'pending',
          attempts: newAttempts,
          lastAttemptAt: sql`now()`,
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: sql`now()`,
        })
        .where(eq(notificationOutbox.id, row.id));
      if (giveUp) result.failed += 1;
      else result.retrying += 1;
    }
  }

  return result;
}

/**
 * Channel that logs the row to stdout. Useful as a default in dev /
 * tests, and as a fallback for channels without a real provider wired up.
 * Never throws.
 */
export const consoleChannel: NotificationChannel = {
  async send(row) {
    // eslint-disable-next-line no-console
    console.log(
      `[notify] [${row.channel}] → ${row.recipient}` +
        ` (template=${row.template}${row.caseId != null ? `, caseId=${row.caseId}` : ''})`,
    );
  },
};

/**
 * Sensible defaults for `npm run dispatch:notifications`: every supported
 * channel falls back to the console handler. Provider-backed implementations
 * override entries here.
 */
export const defaultChannels: Record<string, NotificationChannel> = {
  email: consoleChannel,
  sms: consoleChannel,
  in_app: consoleChannel,
};
