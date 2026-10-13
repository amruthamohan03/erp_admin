'use client';

import { useMemo, useState } from 'react';
import type {
  ExpiryFlag,
  LicenseRow,
  PeriodFlag,
} from '@/db/queries/licenseDashboardTabs';

// Click a KPI card, narrow the table below it.
//
// The distinctive interaction of the uploaded design, and the one place it was
// easiest to get subtly wrong: the CARDS are cumulative — "Expiring in 30
// Days" includes the ones expiring in 7 — while each row carries exactly one
// band so the rows still add up to the total. So a card does not filter on its
// own name; it widens to the set of bands it counted.
//
// Main did this with a DataTables regex over hidden columns
// (`'Expiring7|Expiring15|Expiring30'`), recomputing the categories in the
// browser. Here the bands come from SQL with the row, so the card and the rows
// it reveals are counted by one rule.

export type FilterKind = 'status' | 'expiry' | 'period';

export interface LicenseFilter {
  kind: FilterKind;
  /** The card's own value, e.g. `Expiring30`. */
  value: string;
  /** What the indicator says, taken from the card's label. */
  label: string;
}

/** The bands a cumulative expiry card covers, narrowest first. */
const EXPIRY_COVERS: Record<string, ExpiryFlag[]> = {
  Expired: ['Expired'],
  Expiring7: ['Expiring7'],
  Expiring15: ['Expiring7', 'Expiring15'],
  Expiring30: ['Expiring7', 'Expiring15', 'Expiring30'],
  // "Valid" means anything not yet lapsed, which is every band but Expired.
  Valid: ['Expiring7', 'Expiring15', 'Expiring30', 'Valid'],
};

/** The periods a cumulative card covers — this month includes today. */
const PERIOD_COVERS: Record<string, PeriodFlag[]> = {
  TODAY: ['TODAY'],
  THISWEEK: ['TODAY', 'THISWEEK'],
  THISMONTH: ['TODAY', 'THISWEEK', 'THISMONTH'],
  THISYEAR: ['TODAY', 'THISWEEK', 'THISMONTH', 'THISYEAR'],
};

export function matchesFilter(row: LicenseRow, filter: LicenseFilter | null): boolean {
  if (!filter) return true;
  switch (filter.kind) {
    case 'status':
      return (row.status ?? '') === filter.value;
    case 'expiry':
      return (EXPIRY_COVERS[filter.value] ?? []).includes(row.expiry_flag);
    case 'period':
      return (PERIOD_COVERS[filter.value] ?? []).includes(row.period_flag);
  }
}

export interface LicenseFilterState<T extends LicenseRow> {
  filter: LicenseFilter | null;
  rows: T[];
  /** True while this exact card is the active one — it toggles off on a second click. */
  isActive: (kind: FilterKind, value: string) => boolean;
  toggle: (kind: FilterKind, value: string, label: string) => void;
  clear: () => void;
}

export function useLicenseFilter<T extends LicenseRow>(all: T[]): LicenseFilterState<T> {
  const [filter, setFilter] = useState<LicenseFilter | null>(null);

  const rows = useMemo(() => all.filter((r) => matchesFilter(r, filter)), [all, filter]);

  return {
    filter,
    rows,
    isActive: (kind, value) => filter?.kind === kind && filter.value === value,
    // Clicking the active card clears it: the card is the control, so it has
    // to be able to undo itself without hunting for the Clear button.
    toggle: (kind, value, label) =>
      setFilter((f) => (f?.kind === kind && f.value === value ? null : { kind, value, label })),
    clear: () => setFilter(null),
  };
}
