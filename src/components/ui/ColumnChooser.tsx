'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Columns3, RotateCcw, Search } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import {
  isColumnVisible,
  moveColumn,
  orderedForChooser,
  toggleHidden,
  type ColumnLayout,
} from '@/lib/dataTableColumns';

// §4.25 — show, hide and reorder a table's columns.
//
// Reordering is up/down buttons rather than drag-and-drop: dragging needs a
// dependency (§12 says ask first), and a drag target is the one control a
// keyboard cannot reach. Two buttons are duller and work everywhere.

/** All the chooser needs: an identity and something to call it. */
interface ChooserColumn {
  key: string;
  header: ReactNode;
  /** Offered, but off until the operator turns it on (§4.25.1). */
  defaultHidden?: boolean;
}

interface ColumnChooserProps {
  columns: readonly ChooserColumn[];
  layout: ColumnLayout;
  onChange: (next: ColumnLayout) => void;
  onReset: () => void;
  customised: boolean;
}

/** A column's own words if it has any, else its key — never an empty row. */
function labelOf(col: ChooserColumn): string {
  if (typeof col.header === 'string') return col.header;
  if (typeof col.header === 'number') return String(col.header);
  return col.key;
}

export default function ColumnChooser({
  columns,
  layout,
  onChange,
  onReset,
  customised,
}: ColumnChooserProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Closing drops the search with it — a stale query would make a reopened panel
  // look like it had lost columns.
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // Close on an outside click or Escape. Written here rather than reaching for
  // the dropdown primitive because the panel holds interactive rows — a menu
  // would close on the first toggle, so hiding three columns would mean opening
  // it three times.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const ordered = orderedForChooser(columns, layout);
  // Effective visibility, not just the operator's hidden list: a derived column
  // is off without ever having been hidden (§4.25.1).
  const hidden = new Set(ordered.filter((c) => !isColumnVisible(c, layout)).map((c) => c.key));
  const visibleCount = ordered.length - hidden.size;

  // Since the list now offers every field a row carries, it routinely runs to
  // twenty-odd rows — long enough that finding one by eye is the slow part.
  // Matched against the key as well as the label, so the field name an operator
  // knows from the API finds its humanized column.
  const q = query.trim().toLowerCase();
  const searching = q !== '';
  const listed = searching
    ? ordered.filter((c) => labelOf(c).toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
    : ordered;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        // §4.20 — it produces nothing, it changes the view, so `btn-neutral`.
        className="btn-neutral btn-sm"
        title="Choose which columns to show, and their order"
      >
        <Columns3 className="h-4 w-4" />
        Columns
        {hidden.size > 0 && (
          <span className="ms-1 rounded-full bg-primary-600 px-1.5 text-[10px] font-semibold text-white">
            {visibleCount}/{ordered.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose columns"
          className="absolute end-0 z-30 mt-1 w-72 rounded-md border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Columns</span>
            <button
              type="button"
              onClick={onReset}
              disabled={!customised}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Back to the table's own columns and order"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>

          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input h-8 w-full min-w-0 ps-8 text-xs"
              placeholder="Search columns…"
              aria-label="Search columns"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <ul className="max-h-80 overflow-y-auto py-1">
            {listed.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                No column matches “{query.trim()}”.
              </li>
            )}
            {listed.map((col, i) => {
              const isHidden = hidden.has(col.key);
              const label = labelOf(col);
              return (
                <li
                  key={col.key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50"
                >
                  {/* §4.11 — a boolean is a Toggle, never a checkbox. */}
                  <Toggle
                    size="sm"
                    checked={!isHidden}
                    onChange={(on) => onChange(toggleHidden(layout, col.key, !on))}
                    aria-label={`Show the ${label} column`}
                  />
                  <span
                    className={`flex-1 truncate text-sm ${isHidden ? 'text-muted-foreground' : 'text-foreground'}`}
                    title={label}
                  >
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(moveColumn(columns, layout, col.key, -1))}
                    // Reordering swaps with the NEIGHBOUR, and a search hides
                    // neighbours — so the arrow would move the column past a row
                    // that is not on screen and look like it did nothing.
                    disabled={searching || i === 0}
                    title={searching ? 'Clear the search to reorder' : undefined}
                    aria-label={`Move ${label} earlier`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveColumn(columns, layout, col.key, 1))}
                    disabled={searching || i === listed.length - 1}
                    title={searching ? 'Clear the search to reorder' : undefined}
                    aria-label={`Move ${label} later`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Saved in this browser for this screen.
          </p>
        </div>
      )}
    </div>
  );
}
