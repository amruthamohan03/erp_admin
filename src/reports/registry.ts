import type { ReportRegistryEntry } from './types';
import { handler as licensesByState } from './handlers/licensesByState';
import { handler as invoicesOutstanding } from './handlers/invoicesOutstanding';
import { handler as trackingInProgress } from './handlers/trackingInProgress';

// Code-side report registry per CLAUDE.md §2 step 7. report_key on a
// report_definition_master_t row must have a matching entry here, or
// runReport throws a clear "no handler wired up" error rather than a
// generic 500.
//
// Adding a new report = (1) new handler file under ./handlers/, (2) entry
// here, (3) seed row in report_definition_master_t (+ form_definition if
// it takes parameters). The runReport helper handles the rest.

const registry: Record<string, ReportRegistryEntry> = {
  'licenses-by-state': {
    handler: licensesByState,
    description: 'Counts of licenses grouped by lifecycle state.',
  },
  'invoices-outstanding': {
    handler: invoicesOutstanding,
    description:
      'Invoices currently issued with a due date on or before the supplied cut-off.',
  },
  'tracking-in-progress': {
    handler: trackingInProgress,
    description:
      'Tracking runs currently in_progress, optionally filtered by license type.',
  },
};

export function getReportHandler(reportKey: string): ReportRegistryEntry | null {
  return registry[reportKey] ?? null;
}

export function listRegisteredReportKeys(): string[] {
  return Object.keys(registry);
}
