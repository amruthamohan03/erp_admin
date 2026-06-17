import { db, pool } from '@/lib/db';
import {
  dispatchPendingNotifications,
  defaultChannels,
} from '@/lib/notifications';

// `npm run dispatch:notifications` entry point.
//
// Pulls one batch of pending notification_outbox_t rows and sends them via
// the configured channels (console by default — swap in provider-backed
// handlers in this file once SES / SendGrid / Twilio / etc. credentials
// are wired). Exit code 0 on success regardless of per-row failures —
// they're recorded in last_error and retried on the next run.
//
// Intended to be called from cron or a job runner every minute or so. The
// per-row UPDATE means concurrent invocations don't double-send unless a
// row's status flips between SELECT and UPDATE — extremely unlikely at
// minute-cadence and harmless if it does (the second runner sees status
// already moved off 'pending').

async function main(): Promise<void> {
  const r = await dispatchPendingNotifications(db, {
    channels: defaultChannels,
  });
  console.log(
    `[dispatch] attempted=${r.attempted} sent=${r.sent} failed=${r.failed} ` +
      `retrying=${r.retrying} skipped=${r.skipped}`,
  );
}

main()
  .catch((err) => {
    console.error('Dispatcher crashed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
