'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orderOptions, type SelectOption } from '@/lib/selectOptions';

// The project's single dropdown control (§4.16). Every pick-one list uses this —
// a native <select> gives no type-ahead beyond first-letter matching, which is
// unusable once a list passes a couple of dozen rows (clients, licenses, HS codes).
//
// Styled from design tokens so it follows the configured brand and stays legible in
// dark mode. Options always render in id order regardless of fetch order — see
// orderOptions() in @/lib/selectOptions.
//
// The panel renders in a portal on `position: fixed`, not as an absolutely
// positioned child. An in-flow panel is clipped by the first ancestor with a
// clipping overflow, and the control sits inside three of them: the transaction
// Accordion card (`overflow-hidden`), every list page's `overflow-x-auto` table
// wrapper, and the modals. Portalling fixes all of them in one place rather than
// asking each call site to relax its overflow.

// The list shows up to ten options before it starts scrolling, and shrinks to fit
// when fewer exist — sized in px because the cap is a row count, not a design token.
const MAX_VISIBLE_OPTIONS = 10;
const OPTION_ROW_PX = 32; // px-3 py-1.5 around a text-sm line box
const MIN_VISIBLE_OPTIONS = 3; // floor when the viewport is tight — the list scrolls
const SEARCH_ROW_PX = 56; // the search input and its padding, above the list
const TRIGGER_GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
const MIN_PANEL_WIDTH_PX = 192;

interface PanelPosition {
  left: number;
  width: number;
  /** Exactly one of top/bottom is set — `bottom` anchors a panel that opens upward. */
  top: number | null;
  bottom: number | null;
  maxList: number;
}

/** Kept as an alias so the many existing imports of this name still resolve. */
export type SearchableSelectOption = SelectOption;

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
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const ordered = orderOptions(options);
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Measure the trigger and decide where the panel goes. Called before the panel
  // is first shown (so it never paints in the wrong place) and again on scroll or
  // resize, since a fixed panel does not follow its trigger on its own.
  const place = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();

    const wanted = MAX_VISIBLE_OPTIONS * OPTION_ROW_PX;
    const below = window.innerHeight - r.bottom - TRIGGER_GAP_PX - VIEWPORT_PAD_PX;
    const above = r.top - TRIGGER_GAP_PX - VIEWPORT_PAD_PX;
    // Flip upward only when below genuinely can't hold the panel *and* above is
    // roomier — flipping into an equally cramped space just moves the problem.
    const flip = below < wanted + SEARCH_ROW_PX && above > below;
    const room = (flip ? above : below) - SEARCH_ROW_PX;

    setPosition({
      left: Math.round(r.left),
      width: Math.round(Math.max(r.width, MIN_PANEL_WIDTH_PX)),
      top: flip ? null : Math.round(r.bottom + TRIGGER_GAP_PX),
      bottom: flip ? Math.round(window.innerHeight - r.top + TRIGGER_GAP_PX) : null,
      maxList: Math.round(
        Math.max(MIN_VISIBLE_OPTIONS * OPTION_ROW_PX, Math.min(wanted, room)),
      ),
    });
  }, []);

  // Close on outside click. The panel lives in a portal, so it is not inside
  // rootRef — both subtrees have to count as "inside".
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setTouched(true);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the panel pinned to its trigger while the page or any scroll container
  // moves — `true` catches scrolls on nested containers, which don't bubble.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

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

  // Measure before showing rather than in an effect afterwards, so the panel's
  // first paint is already in the right place.
  function openPanel() {
    place();
    setOpen(true);
  }

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
      openPanel();
    }
  }

  const display = selected?.label ?? '';

  // The field holds something, but nothing in the list carries that value — so
  // the label cannot be resolved and `display` is empty.
  //
  // Falling through to the placeholder here made the control lie: a populated
  // field looked exactly like an empty one. It surfaced on Export Tracking,
  // where Kind is sourced from `kinds?group=export` while the licence supplies
  // whatever kind IT carries — an export against an import licence set the field
  // to a kind the list does not offer, and the screen showed a blank box, so the
  // autofill looked broken when it had in fact worked.
  //
  // Say so instead. The operator needs to know the field is not empty, and that
  // what it holds is not something this list can offer.
  const unresolved = !selected && value !== '';

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
          else openPanel();
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'input flex items-center justify-between text-left',
          size === 'sm' && 'px-2 py-1 text-sm',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          display ? 'text-foreground' : 'text-muted-foreground',
          unresolved && 'text-amber-700 dark:text-amber-400',
        )}
        title={
          unresolved
            ? `This field holds "${value}", which is not one of the options offered here. Pick a value from the list, or correct the record it was copied from.`
            : undefined
        }
      >
        <span className="truncate">
          {display || (unresolved ? `Not in this list (${value})` : placeholder)}
        </span>
        <ChevronDown
          className={cn(
            'ms-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
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
        >
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
          <ul
            id={listId}
            role="listbox"
            className="scrollbar-thin overflow-y-auto py-1 text-sm"
            style={{ maxHeight: position.maxList }}
          >
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
        </div>,
        document.body,
      )}
    </div>
  );
}
