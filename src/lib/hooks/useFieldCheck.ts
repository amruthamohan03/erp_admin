'use client';

import { useEffect, useState } from 'react';
import { checkFieldValue, type FieldCheck } from '@/lib/validation/fields';

/** How long typing must pause before the live check speaks. */
export const TYPING_PAUSE_MS = 600;

/**
 * §4.40 — the live format check for one input: the SAME `checkFieldValue` the
 * server runs on save, judged on the value typing last paused on, so "missing
 * the @" does not flash under every keystroke of a half-typed address.
 *
 * Used by the metadata pages' FieldHints and by hand-written forms alike, so a
 * users-master email and a client-page email are judged and worded the same.
 */
export function useFieldCheck(
  fieldType: string,
  label: string,
  value: unknown,
  opts: { maxLength?: number; pattern?: string; patternMessage?: string; warnUnusual?: boolean; disabled?: boolean } = {},
): FieldCheck {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setSettled(text), TYPING_PAUSE_MS);
    return () => clearTimeout(t);
  }, [text]);

  if (opts.disabled) return { warnings: [] };
  return checkFieldValue(fieldType, settled, label, opts);
}
