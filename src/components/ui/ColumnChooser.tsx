'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Columns3, RotateCcw } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import {
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
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Written here rather than reaching for
  // the dropdown primitive because the panel holds interactive rows — a menu
  // would close on the first toggle, so hiding three columns would mean opening
  // it three times.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ordered = orderedForChooser(columns, layout);
  const hidden = new Set(layout.hidden);
  const visibleCount = ordered.length - hidden.size;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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

          <ul className="max-h-80 overflow-y-auto py-1">
            {ordered.map((col, i) => {
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
                    disabled={i === 0}
                    aria-label={`Move ${label} earlier`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveColumn(columns, layout, col.key, 1))}
                    disabled={i === ordered.length - 1}
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
