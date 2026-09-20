'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, ChevronDown, Search, SquareX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orderOptions } from '@/lib/selectOptions';
import Toggle from './Toggle';
import { useAnchoredPanel } from './useAnchoredPanel';

// The project's pick-MANY dropdown — the sibling of SearchableSelect (§4.16) for
// lists where an operator ticks several rows: an invoice's licences, then the
// MCA files on them.
//
// Each row is a <Toggle> (§4.11 — there are no checkboxes in this app), with an
// optional second line of detail under the label. A "Select all" button acts on
// the rows the search is showing, so the search box scopes a bulk pick. The
// closed control names the one pick, or counts them.
//
// Options render in id order like every other dropdown (orderOptions).

export interface MultiSelectOption {
  value: string;
  label: string;
  /** A muted second line — "FOB $78,350.54 · 12,373.80 kg". */
  detail?: string;
  /** A small trailing badge — "3 files". */
  badge?: string;
}

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  /** Closed-control text for several picks: `${n} ${noun} selected`. */
  noun?: string;
  /** Shown in the open panel when there is nothing to pick. */
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  /** §4.18 — force the error highlight, e.g. after a failed save named this field. */
  invalid?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export default function MultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Select...',
  noun = 'items',
  emptyText = 'Nothing to select',
  disabled = false,
  required = false,
  invalid,
  className,
  id,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hasDetail = options.some((o) => o.detail);
  const { rootRef, panelRef, position, place } = useAnchoredPanel({
    open,
    onDismiss: () => {
      setOpen(false);
      setTouched(true);
    },
    rowPx: hasDetail ? 48 : 36,
    headerPx: 100,
    maxRows: 8,
  });

  const chosen = useMemo(() => new Set(values), [values]);

  const filtered = useMemo(() => {
    const ordered = orderOptions(options);
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function toggle(value: string, on: boolean): void {
    const next = new Set(values);
    if (on) next.add(value);
    else next.delete(value);
    // Keep the option order, so the stored selection does not depend on the
    // order the rows were clicked in.
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  }

  // Select all / none over what the search is SHOWING — the search box scopes a
  // bulk pick, as a matrix's column header does (§4.9).
  const allShownOn = filtered.length > 0 && filtered.every((o) => chosen.has(o.value));
  function toggleShown(): void {
    const next = new Set(values);
    for (const o of filtered) {
      if (allShownOn) next.delete(o.value);
      else next.add(o.value);
    }
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  }

  const selectedLabels = options.filter((o) => chosen.has(o.value)).map((o) => o.label);
  const display =
    selectedLabels.length === 0
      ? ''
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} ${noun} selected`;
  const showInvalid = invalid ?? (required && touched && values.length === 0);

  return (
    // min-w-0 — see SearchableSelect: a long label must truncate, not widen the row.
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          value={values.join(',')}
          required
          onChange={() => {}}
        />
      )}
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={showInvalid || undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            setTouched(true);
          } else {
            place();
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            place();
            setOpen(true);
          }
        }}
        className={cn(
          'input flex items-center justify-between text-left',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          display ? 'text-foreground' : 'text-muted-foreground',
        )}
        title={selectedLabels.join(', ') || undefined}
      >
        <span className="truncate">{display || placeholder}</span>
        <ChevronDown className={cn('ms-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          // Above the modals (z-[70]) — the control is used inside them.
          className="fixed z-[100] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
          style={{
            left: position.left,
            width: position.width,
            top: position.top ?? undefined,
            bottom: position.bottom ?? undefined,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              setTouched(true);
            }
          }}
        >
          <div className="space-y-2 border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                className="input ps-8"
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={toggleShown}
              disabled={filtered.length === 0}
              className="btn-primary btn-sm w-full justify-center disabled:opacity-50"
            >
              {allShownOn ? <SquareX className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              {allShownOn ? 'Deselect all' : 'Select all'}
              {query.trim() ? ' matching' : ''} ({filtered.length})
            </button>
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className="scrollbar-thin space-y-1 overflow-y-auto p-1.5 text-sm"
            style={{ maxHeight: position.maxList }}
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-muted-foreground">{options.length === 0 ? emptyText : 'No matches'}</li>
            )}
            {filtered.map((o) => {
              const on = chosen.has(o.value);
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  {/* The whole row toggles, not just the switch — a narrow
                      target in a long list is the slow way to pick twenty. */}
                  <div
                    onClick={() => toggle(o.value, !on)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border px-2.5 py-1.5 transition-colors',
                      on ? 'border-primary-300 bg-primary-50 dark:border-primary-500/40 dark:bg-primary-500/10' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <Toggle size="sm" checked={on} onChange={(v) => toggle(o.value, v)} aria-label={o.label} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground" title={o.label}>{o.label}</span>
                        {o.badge && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {o.badge}
                          </span>
                        )}
                      </span>
                      {o.detail && <span className="block truncate text-[11px] text-muted-foreground" title={o.detail}>{o.detail}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
