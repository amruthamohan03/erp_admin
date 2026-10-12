import { pool } from '@/lib/db';
import { sweepDelayNotices } from '@/db/queries/delayTracker';

// `npm run sweep:delays` — raise a notification for every tracked file that has
// just crossed one of its rule's days-remaining marks, or passed its deadline.
//
// Intended to run once a day, early. Running it twice in a day is harmless:
// `delay_notice_log_t` records each mark as it is announced, so the second run
// finds them claimed and says nothing.
//
// Whether anyone hears about it is `notification_event_master_t` — an event
// with no roles attached raises nothing, so this is safe to schedule before
// anyone has decided who should be told.

async function main(): Promise<void> {
  const r = await sweepDelayNotices();
  console.log(
    `[delays] checked=${r.checked} raised=${r.raised} already-announced=${r.skipped}`,
  );
}

main()
  .catch((err) => {
    console.error('Delay sweep crashed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
