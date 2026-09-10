'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// The question asked BEFORE a consequential action — the twin of
// [ResultDialog](src/components/ui/ResultDialog.tsx), which reports what
// happened after it (§4.22).
//
// §4.22 permits `confirm()` for this, and several screens use it. What it cannot
// do is name the record in styled prose, carry a destructive tone, or survive a
// theme — so the screens that needed those each grew a private modal instead,
// and the wording, the button order and the escape route drifted between them.
// This is the one implementation (§4.10, §4.8).
//
// Deliberately NOT a result dialog: it takes an action, not an outcome, and the
// caller keeps its own busy state because the work happens after Confirm.

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The consequence, in prose. Name the record — "Remove RAWBANK's 30-06 rate", not "Are you sure?". */
  children: ReactNode;
  /** Verb, not "Yes" — the button should read as the thing it does. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm red. Use it when the action destroys or hides something (§4.20). */
  tone?: 'default' | 'danger';
  icon?: ReactNode;
  /** True while the action is in flight; disables the confirm without hiding the cancel (§4.21). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  icon,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on CANCEL, not on the confirm. A dialog that opens with the
  // destructive button focused turns a stray Enter into the action it exists to
  // guard against — the opposite of ResultDialog, where OK is the safe default.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const danger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="card w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger
                ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
          >
            {icon ?? <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="font-semibold text-foreground">
              {title}
            </h2>
            <div id="confirm-body" className="mt-1 text-sm text-muted-foreground">
              {children}
            </div>
          </div>
        </div>

        {/* §4.21 — the labelled way out stays enabled while the action runs. */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`${danger ? 'btn-danger' : 'btn-primary'} disabled:opacity-50`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
