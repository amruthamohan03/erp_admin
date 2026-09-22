'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_LAYOUT, type ColumnLayout } from '@/lib/dataTableColumns';

// A table's column layout, remembered between visits.
//
// Stored in localStorage rather than against the user record, deliberately:
// it is a view preference, not data. It changes constantly as somebody works,
// nobody else ever needs to read it, and a round trip per reorder would make the
// control feel worse than not having it. The cost is that it does not follow an
// operator to another machine — worth saying out loud, and a per-user table is
// the upgrade path if that turns out to matter.
//
// Nothing is read until after mount. Reading storage during render would give the
// server one answer and the browser another, which is the hydration mismatch that
// `usePagedList` gates against for the same reason.

const PREFIX = 'erp.dataTable.columns.';

function read(key: string): ColumnLayout {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return EMPTY_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    // Validated rather than trusted: this is user-editable storage, and a
    // hand-edited or stale value must degrade to "no saved view" instead of
    // throwing inside a table's render.
    if (!parsed || typeof parsed !== 'object') return EMPTY_LAYOUT;
    const { order, hidden, shown } = parsed as Partial<ColumnLayout>;
    const keys = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
    // A layout saved before `shown` existed simply has none, which is the right
    // reading: that operator had never turned a default-hidden field on.
    return { order: keys(order), hidden: keys(hidden), shown: keys(shown) };
  } catch {
    // Private mode, disabled storage, or malformed JSON — all mean "no saved view".
    return EMPTY_LAYOUT;
  }
}

export interface UseColumnLayoutResult {
  layout: ColumnLayout;
  setLayout: (next: ColumnLayout) => void;
  reset: () => void;
  /** False until the saved layout has been read, so the first paint matches SSR. */
  ready: boolean;
  /** Whether anything has been customised — drives the "Reset" affordance. */
  customised: boolean;
}

export function useColumnLayout(tableKey: string): UseColumnLayoutResult {
  const [layout, setLayoutState] = useState<ColumnLayout>(EMPTY_LAYOUT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Synchronising with an external store, which is what an effect is for.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLayoutState(read(tableKey));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tableKey]);

  const setLayout = useCallback(
    (next: ColumnLayout) => {
      setLayoutState(next);
      try {
        window.localStorage.setItem(PREFIX + tableKey, JSON.stringify(next));
      } catch {
        // Storage full or blocked. The layout still applies for this session —
        // failing to remember it must never stop the operator changing it.
      }
    },
    [tableKey],
  );

  const reset = useCallback(() => {
    setLayoutState(EMPTY_LAYOUT);
    try {
      window.localStorage.removeItem(PREFIX + tableKey);
    } catch {
      // As above.
    }
  }, [tableKey]);

  return {
    layout,
    setLayout,
    reset,
    ready,
    customised:
      layout.order.length > 0 || layout.hidden.length > 0 || (layout.shown?.length ?? 0) > 0,
  };
}

export default useColumnLayout;
