'use client';

import { useEffect, useRef, useState } from 'react';
import { safeFetchJson } from '@/lib/safeFetch';

// Debounced live uniqueness check for form fields. Adapted from
// main with the branch's `{ ok, data }` response envelope.
//
// Drives the badge next to a master-name input ("Available" /
// "Already exists" / "Checking..."). Final source of truth is still
// the server's UNIQUE constraint at submit time — this is UX, not
// validation. Backed by /api/v1/uniqueness/{resource} which returns
// `{ available: boolean, conflict_id: number | null }`.

export type UniqueStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export interface UseUniqueCheckArgs {
  /** Slug of the master under /api/v1/uniqueness/{resource}. */
  resource: string;
  /** Current value of the field being checked. */
  value: string;
  /** When editing, the id of the row being edited — so it doesn't collide with itself. */
  excludeId?: number | null;
  /**
   * For scoped resources (a name unique only within a parent row), the FK
   * value the uniqueness is scoped under.
   * When the resource requires scoping and this is missing/null,
   * the check stays in `idle` rather than firing an invalid request.
   */
  scopeId?: number | null;
  /**
   * Which column to check, for a master that constrains more than one.
   * Omitted means the resource's main name column, which is what nearly
   * every screen wants — Type of Goods is the exception, constraining both
   * its Type and its Short Name.
   */
  field?: string;
  /** Minimum trimmed length before a check fires (default 1). */
  minLength?: number;
  /** Debounce in ms (default 350). */
  debounceMs?: number;
}

export interface UseUniqueCheckResult {
  status: UniqueStatus;
  message: string;
  /**
   * The record already holding the value, named the way a person knows it
   * (a client's short code), when the resource declares a label column — so a
   * duplicate warning can say WHICH record (§4.40). Null otherwise.
   */
  conflictLabel: string | null;
}

export function useUniqueCheck({
  resource,
  value,
  excludeId,
  scopeId,
  field,
  minLength = 1,
  debounceMs = 350,
}: UseUniqueCheckArgs): UseUniqueCheckResult {
  const [status, setStatus] = useState<UniqueStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [conflictLabel, setConflictLabel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('idle');
      setMessage('');
      setConflictLabel(null);
      abortRef.current?.abort();
      return;
    }

    setStatus('checking');
    setMessage('Checking...');

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const params = new URLSearchParams({ name: trimmed });
      if (excludeId != null) params.set('exclude_id', String(excludeId));
      if (scopeId != null) params.set('scope_id', String(scopeId));
      if (field) params.set('field', field);
      const res = await safeFetchJson<{ available?: boolean; conflict_label?: string | null }>(
        `/api/v1/uniqueness/${resource}?${params.toString()}`,
        { signal: controller.signal },
      );
      // Superseded by a newer keystroke — that check owns the indicator now.
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setStatus('error');
        setMessage(res.message);
        return;
      }
      if (res.data?.available === true) {
        setStatus('available');
        setMessage('Available');
        setConflictLabel(null);
      } else {
        setStatus('taken');
        setMessage('Already exists');
        setConflictLabel(res.data?.conflict_label || null);
      }
    }, debounceMs);

    return () => {
      clearTimeout(handle);
    };
  }, [resource, value, excludeId, scopeId, field, minLength, debounceMs]);

  return { status, message, conflictLabel };
}
