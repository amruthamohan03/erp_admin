'use client';

import DelayTrackerView from '@/modules/tracking/delayTracker/DelayTrackerView';

// §4.29 — the Delay Tracker. What "late" means is `delay_rule_master_t`,
// edited under Masters → Delay Rules; this screen only reports against it.

export default function DelayTrackerPage() {
  return <DelayTrackerView />;
}
