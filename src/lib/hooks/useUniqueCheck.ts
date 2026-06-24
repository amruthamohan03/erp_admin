'use client';

import { useEffect, useRef, useState } from 'react';

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
  /** Minimum trimmed length before a check fires (default 1). */
  minLength?: number;
  /** Debounce in ms (default 350). */
  debounceMs?: number;
}

export interface UseUniqueCheckResult {
  status: UniqueStatus;
  message: string;
}

export function useUniqueCheck({
  resource,
  value,
  excludeId,
  minLength = 1,
  debounceMs = 350,
}: UseUniqueCheckArgs): UseUniqueCheckResult {
  const [status, setStatus] = useState<UniqueStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('idle');
      setMessage('');
      abortRef.current?.abort();
      return;
    }

    setStatus('checking');
    setMessage('Checking...');

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({ name: trimmed });
        if (excludeId != null) params.set('exclude_id', String(excludeId));
        const res = await fetch(
          `/api/v1/uniqueness/${resource}?${params.toString()}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setStatus('error');
          setMessage(json.error?.message ?? 'Could not check');
          return;
        }
        if (json.data?.available === true) {
          setStatus('available');
          setMessage('Available');
        } else {
          setStatus('taken');
          setMessage('Already exists');
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setStatus('error');
        setMessage('Network error');
      }
    }, debounceMs);

    return () => {
      clearTimeout(handle);
    };
  }, [resource, value, excludeId, minLength, debounceMs]);

  return { status, message };
}
