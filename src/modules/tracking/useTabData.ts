'use client';

import { useEffect, useState } from 'react';
import { safeFetchJson } from '@/lib/safeFetch';

// One fetch-per-tab hook, shared by every tracking dashboard's analysis tabs.
//
// Each tab is loaded the first time it is opened, not on page load: the
// Briefing table reads every cleared file and the Reports tab runs 28
// conditional counts, so an operator who only wanted the Overview should not
// pay for either. Seven copies of this `useEffect` is how one of them ends up
// without the cancellation guard.

export interface TabState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch, for a tab whose filters changed. */
  reload: () => void;
}

/**
 * `loading` is DERIVED from "which request has landed" rather than set at the
 * top of the effect. Setting it there is a synchronous setState inside an
 * effect, which costs a second render pass before the fetch has even started —
 * and comparing the settled key against the wanted one is true from the first
 * render after `url` changes, so the flag is correct earlier, not later.
 *
 * Data from the previous request stays on screen while the next one is in
 * flight. For the Reports tab, whose url changes when its filters are applied,
 * that means the counts dim rather than vanishing and reappearing.
 */
export function useTabData<T>(url: string | null): TabState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
  }>({ key: null, data: null, error: null });

  const key = url === null ? null : `${nonce}\u0000${url}`;

  useEffect(() => {
    // A null key means "not open yet" — nothing is requested, and the tab keeps
    // whatever it last had so switching back to it does not flash a skeleton.
    if (key === null || url === null) return;
    let cancelled = false;
    void (async () => {
      const res = await safeFetchJson<T>(url);
      if (cancelled) return;
      setSettled(
        res.ok
          ? { key, data: res.data ?? null, error: null }
          : { key, data: null, error: res.message || 'This tab could not be loaded.' },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [key, url]);

  return {
    data: settled.data,
    loading: key !== null && settled.key !== key,
    error: settled.error,
    reload: () => setNonce((n) => n + 1),
  };
}
