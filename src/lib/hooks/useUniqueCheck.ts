'use client';

import { useEffect, useRef, useState } from 'react';

export type UniqueStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export interface UseUniqueCheckArgs {
  /** Backend endpoint, e.g. `/api/uniqueness/done-by`. */
  endpoint: string;
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

/**
 * Live availability check for a master's name-like field. Debounced fetch
 * against a JSON endpoint that returns `{ available: boolean, conflictId: number | null }`.
 */
export function useUniqueCheck({
  endpoint,
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
        const res = await fetch(`${endpoint}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not check');
          return;
        }
        const json = await res.json();
        if (json?.success && json.data?.available === true) {
          setStatus('available');
          setMessage('Available');
        } else if (json?.success && json.data?.available === false) {
          setStatus('taken');
          setMessage('Already exists');
        } else {
          setStatus('error');
          setMessage(typeof json?.message === 'string' ? json.message : 'Could not check');
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
  }, [endpoint, value, excludeId, minLength, debounceMs]);

  return { status, message };
}
