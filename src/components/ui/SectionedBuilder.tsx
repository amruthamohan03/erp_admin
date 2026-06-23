'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

// Shared primitives for the sectioned-accordion form pattern used by
// ImportBuilder, ExportBuilder, and any future transactional entity
// with many fields grouped into logical sections.
//
// The split: this file owns layout + field rendering + completion
// math. The caller owns:
//   * the `Form` shape (which fields exist)
//   * the `SECTIONS` array (which fields belong to which section)
//   * the master picker lists + their fetch
//   * the `renderSection(key)` switch (the per-section layout)
//   * load / save / error handling
//
// Two callers validated this abstraction. If a third hits the same
// shape, the renderSection switch can be table-driven (a `fields`
// array on each section entry with `{type, label, k, options?}`) —
// deferred until the third caller exists.

export type FormValue = string | number | boolean | null;
export type Form = Record<string, FormValue>;

export interface MasterOption {
  value: string;
  label: string;
}

export interface BuilderSection<F extends Form = Form> {
  key: string;
  title: string;
  fields: (keyof F & string)[];
}

// useSectionCompletion — per-section "X / Y filled" counts.
// A boolean `false` counts as filled (it's an explicit answer);
// null / undefined / empty string don't.

export function useSectionCompletion<F extends Form>(
  form: F,
  sections: readonly BuilderSection<F>[],
): Record<string, { filled: number; total: number }> {
  return useMemo(() => {
    const map: Record<string, { filled: number; total: number }> = {};
    for (const sec of sections) {
      let filled = 0;
      for (const f of sec.fields) {
        const v = form[f];
        if (v === false) filled += 1;
        else if (v != null && v !== '') filled += 1;
      }
      map[sec.key] = { filled, total: sec.fields.length };
    }
    return map;
  }, [form, sections]);
}

// SectionAccordion — the collapsible card with title bar + completion
// badge. Caller controls open/closed via `open` + `onToggle`.

interface SectionAccordionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  filled: number;
  total: number;
  children: React.ReactNode;
}

export function SectionAccordion({
  title,
  open,
  onToggle,
  filled,
  total,
  children,
}: SectionAccordionProps) {
  return (
    <div className="card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <span className="font-semibold text-slate-900">{title}</span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            filled === 0
              ? 'bg-slate-100 text-slate-500'
              : filled === total
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-primary-50 text-primary-700'
          }`}
        >
          {filled} / {total}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-4">{children}</div>
      )}
    </div>
  );
}

// ── Field primitives ───────────────────────────────────────────────

export function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

export interface FieldBaseProps {
  label: string;
  k: string;
  form: Form;
  set: (k: string) => (v: FormValue) => void;
  span?: 1 | 2 | 3;
}

function FieldShell({
  label,
  span = 1,
  children,
}: {
  label: string;
  span?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const spanClass =
    span === 3 ? 'lg:col-span-3' : span === 2 ? 'lg:col-span-2' : '';
  return (
    <div className={spanClass}>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Text({
  label,
  k,
  form,
  set,
  maxLength,
  span,
}: FieldBaseProps & { maxLength?: number }) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <input
        type="text"
        className="input"
        value={v}
        maxLength={maxLength}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}

export function Num({
  label,
  k,
  form,
  set,
  integer = false,
  span,
}: FieldBaseProps & { integer?: boolean }) {
  const v = form[k];
  return (
    <FieldShell label={label} span={span}>
      <input
        type="number"
        step={integer ? '1' : 'any'}
        className="input"
        value={v == null ? '' : String(v)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            set(k)(null);
          } else if (integer) {
            const n = parseInt(raw, 10);
            set(k)(Number.isFinite(n) ? n : null);
          } else {
            // Keep as string — preserves precision through the API
            // (numeric(15,2) on the DB).
            set(k)(raw);
          }
        }}
      />
    </FieldShell>
  );
}

export function DateField({ label, k, form, set, span }: FieldBaseProps) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <input
        type="date"
        className="input"
        value={v}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}

export function Picker({
  label,
  k,
  form,
  set,
  options,
  span,
}: FieldBaseProps & { options: MasterOption[] }) {
  const v = form[k];
  return (
    <FieldShell label={label} span={span}>
      <SearchableSelect
        value={v == null ? '' : String(v)}
        onChange={(val) => set(k)(val === '' ? null : Number(val))}
        options={options}
        emptyLabel="None"
        placeholder="Select..."
      />
    </FieldShell>
  );
}

export function Bool({ label, k, form, set, span }: FieldBaseProps) {
  const v = form[k] === true;
  return (
    <FieldShell label={label} span={span}>
      <label className="inline-flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={v}
          onChange={(e) => set(k)(e.target.checked)}
        />
        <span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span>
      </label>
    </FieldShell>
  );
}

export function Area({ label, k, form, set, span }: FieldBaseProps) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <textarea
        className="input min-h-[80px]"
        rows={3}
        value={v}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}

// fetchMasterOptions — convenience wrapper for the on-mount Promise.all
// each builder runs. Calls /api/v1/<resource>?pageSize=500 and maps
// each row to a MasterOption via `toOption`.

export async function fetchMasterOptions<T>(
  url: string,
  toOption: (row: T) => MasterOption,
): Promise<MasterOption[]> {
  const res = await fetch(`${url}?pageSize=500`);
  const json = await res.json();
  if (!json.ok) return [];
  const data = json.data as T[];
  return data.map(toOption);
}
