'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

// §4.22 — the outcome of a create/update, acknowledged before anything moves.
//
// A save used to either navigate away silently or drop a line of red text into
// the action bar. Neither tells an operator plainly that the record was written,
// and a silent navigation is indistinguishable from a page that just changed on
// its own. This is the single dialog every save reports through.
//
// Success confirms, then the OK button carries the user to the list. Failure
// explains and dismisses in place, because the form still holds the work and the
// offending field is already marked (§4.18).

export type ResultStatus = 'success' | 'error';

export interface SaveResult {
  status: ResultStatus;
  title: string;
  message: string;
  /** Secondary line — a server detail, or which field to fix. */
  detail?: string;
}

interface ResultDialogProps {
  result: SaveResult | null;
  /** OK / Escape / backdrop. The caller decides what happens next. */
  onDismiss: () => void;
  /** Label for the confirming button. Defaults to "OK". */
  okLabel?: string;
}

export default function ResultDialog({ result, onDismiss, okLabel = 'OK' }: ResultDialogProps) {
  const okRef = useRef<HTMLButtonElement>(null);

  // Focus the confirming control so Enter or Space completes the flow without
  // reaching for the mouse — this dialog sits between the user and the list.
  useEffect(() => {
    if (result) okRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (!result) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [result, onDismiss]);

  if (!result) return null;
  const ok = result.status === 'success';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="result-title"
        aria-describedby="result-message"
        className="card w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              ok
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
            }`}
          >
            {ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="result-title" className="font-semibold text-foreground">
              {result.title}
            </h2>
            <p id="result-message" className="mt-1 text-sm text-muted-foreground">
              {result.message}
            </p>
            {result.detail && (
              <p className="mt-2 break-words rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                {result.detail}
              </p>
            )}
          </div>
        </div>

        {/* §4.21 — a labelled way out, even though OK is the only decision here. */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            ref={okRef}
            type="button"
            onClick={onDismiss}
            className={ok ? 'btn-primary' : 'btn-secondary'}
          >
            {ok ? okLabel : (<><X className="h-4 w-4" /> Close</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
