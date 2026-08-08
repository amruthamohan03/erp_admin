'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// The project's single dropdown control (§4.16). Every pick-one list uses this —
// a native <select> gives no type-ahead beyond first-letter matching, which is
// unusable once a list passes a couple of dozen rows (clients, licenses, HS codes).
//
// Styled from design tokens so it follows the configured brand and stays legible in
// dark mode. Options always render A→Z (numeric-aware) regardless of fetch order.

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Label shown for the "no selection" entry. If omitted, no clear/none row is rendered. */
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  /** `sm` matches a compact inline control (filter bars, table footers). */
  size?: 'sm' | 'md';
  /**
   * §4.18 — force the error highlight, e.g. after a failed save named this field.
   * Left undefined, the control still marks itself once a required pick has been
   * dismissed without choosing.
   */
  invalid?: boolean;
  'aria-label'?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  emptyLabel,
  disabled = false,
  required = false,
  className,
  id,
  size = 'md',
  invalid,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  // The visible control is a <button>, which the browser never marks
  // `:user-invalid`. Track engagement ourselves so a required pick the user opened
  // and abandoned reads the same as an empty required <input> (§4.18).
  const [touched, setTouched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    // All dropdowns render their options in ascending (A→Z, numeric-aware) order.
    const sorted = options
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTouched(true);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Reset search & focus when the panel opens. The setState here is in response
  // to a prop transition (open false → true), not a cascading render cycle.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(val: string) {
    onChange(val);
    setTouched(true);
    setOpen(false);
  }

  function close() {
    setTouched(true);
    setOpen(false);
  }

  const showInvalid = invalid ?? (required && touched && value === '');

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const max = filtered.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(max, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // Opening the panel from the closed trigger, via the keyboard.
  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  }

  const display = selected?.label ?? '';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {/* Hidden field so form `required` validation still works */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          value={value}
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
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'input flex items-center justify-between text-left',
          size === 'sm' && 'px-2 py-1 text-sm',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          display ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="truncate">{display || placeholder}</span>
        <ChevronDown
          className={cn(
            'ms-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              className="input ps-9"
              placeholder="Search..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul id={listId} role="listbox" className="scrollbar-thin max-h-56 overflow-y-auto py-1 text-sm">
            {emptyLabel !== undefined && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ''}
                  onClick={() => pick('')}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-1.5 text-left italic text-muted-foreground hover:bg-accent',
                    value === '' && 'bg-primary-50 text-primary-700',
                  )}
                >
                  <span>{emptyLabel}</span>
                  {value === '' && <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            )}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-muted-foreground">No matches</li>
            )}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              const isHighlighted = i === highlight;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(o.value)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      'w-full px-3 py-1.5 text-left',
                      isHighlighted && 'bg-accent',
                      isSelected
                        ? 'bg-primary-50 font-medium text-primary-700'
                        : 'text-foreground/80',
                    )}
                  >
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
