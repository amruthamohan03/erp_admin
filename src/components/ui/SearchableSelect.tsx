'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Reset search & focus on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus after the panel renders.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(val: string) {
    onChange(val);
    setOpen(false);
  }

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
      setOpen(false);
    }
  }

  const display = selected?.label ?? '';

  return (
    <div ref={rootRef} className={['relative', className ?? ''].join(' ')}>
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
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={[
          'input flex items-center justify-between text-left',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          !display ? 'text-slate-400' : 'text-slate-900',
        ].join(' ')}
      >
        <span className="truncate">{display || placeholder}</span>
        <ChevronDown
          className={[
            'ml-2 h-4 w-4 shrink-0 text-slate-400 transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-200 p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              className="input pl-9"
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
            role="listbox"
            className="max-h-56 overflow-y-auto py-1 text-sm"
          >
            {emptyLabel !== undefined && (
              <li>
                <button
                  type="button"
                  onClick={() => pick('')}
                  className={[
                    'flex w-full items-center justify-between px-3 py-1.5 text-left text-slate-500 italic hover:bg-slate-50',
                    value === '' ? 'bg-primary-50 text-primary-700' : '',
                  ].join(' ')}
                >
                  <span>{emptyLabel}</span>
                  {value === '' && <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            )}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-slate-400">No matches</li>
            )}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              const isHighlighted = i === highlight;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    onMouseEnter={() => setHighlight(i)}
                    className={[
                      'w-full px-3 py-1.5 text-left',
                      isHighlighted ? 'bg-slate-100' : '',
                      isSelected
                        ? 'bg-primary-50 font-medium text-primary-700'
                        : 'text-slate-700',
                    ].join(' ')}
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
