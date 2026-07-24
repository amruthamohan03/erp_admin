'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { PageAccordionDef } from '@/types';
import { parseConditions, resolveFieldState } from '@/lib/pages/conditions';
import { parseDerive, isEditableDerive } from '@/lib/pages/derive';
import { accentFor } from './accents';
import FieldRenderer from './FieldRenderer';

interface AccordionProps {
  accordion: PageAccordionDef;
  values: Record<string, unknown>;
  onChange: (fieldName: string, value: unknown) => void;
  // §4.12 — receives the names of the fields that are currently VISIBLE (per the
  // config-driven conditions) so a kind-hidden section isn't written on save.
  onSave: (visibleFieldNames: string[]) => Promise<void>;
  defaultOpen?: boolean;
  // Position of this accordion on the page — picks a stable accent colour from
  // ACCENTS so sibling sections read as one harmonious set (see §4.10: one
  // shared palette, not per-page ad-hoc colours).
  accentIndex?: number;
  // §4.11 — entity context passed down to file fields for S3 upload keying.
  entityType?: string;
  entityId?: string;
}

const COL_CLASS: Record<string, string> = {
  '5-per-row': 'w-full md:w-1/2 lg:w-1/3 xl:w-1/5 px-2',
  '12': 'w-full px-2',
  '6': 'w-full md:w-1/2 px-2',
};

function colClassFor(props: Record<string, unknown> | null): string {
  const span = (props?.['colSpan'] as string | undefined) ?? '5-per-row';
  return COL_CLASS[span] ?? COL_CLASS['5-per-row'];
}

export default function Accordion({
  accordion,
  values,
  onChange,
  onSave,
  defaultOpen,
  accentIndex = 0,
  entityType,
  entityId,
}: AccordionProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const readonly = accordion.permission === 'view';
  const accent = accentFor(accentIndex);

  // §4.12 — resolve every field's effective state against the current form values
  // once per render. Hidden fields are dropped from the DOM and from the save
  // payload; the same rules run server-side (defense in depth).
  const resolved = accordion.fields.map((field) => ({
    field,
    state: resolveFieldState(parseConditions(field.conditions), field.required, values),
  }));
  const visibleFields = resolved.filter((r) => r.state.visible);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(visibleFields.map((r) => r.field.name));
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={clsx(
        'card mb-4 overflow-hidden transition-shadow',
        open ? 'shadow-md ring-1 ring-slate-200/70 dark:ring-slate-700/60' : 'hover:shadow-sm',
      )}
    >
      {/* Accent bar — a thin gradient strip that ties each section to its colour. */}
      <div className={clsx('h-1 w-full bg-gradient-to-r', accent.bar)} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
          open ? accent.tint : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60',
        )}
      >
        {/* Icon chip — gradient square carrying the Tabler `ti ti-*` glyph. */}
        <span
          className={clsx(
            'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm bg-gradient-to-br',
            accent.chip,
          )}
        >
          {accordion.icon ? <i className={clsx(accordion.icon, 'text-lg leading-none')} /> : null}
        </span>

        <span className="flex-1 min-w-0">
          <span className={clsx('block font-semibold truncate', open ? accent.title : 'text-slate-900 dark:text-slate-100')}>
            {accordion.title}
          </span>
          <span className="block text-xs text-slate-400 dark:text-slate-500">
            {visibleFields.length} field{visibleFields.length === 1 ? '' : 's'}
          </span>
        </span>

        {readonly && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 dark:bg-slate-800 dark:text-slate-300">
            read-only
          </span>
        )}
        <ChevronDown
          className={clsx(
            'shrink-0 h-5 w-5 text-slate-400 transition-transform duration-200',
            open ? 'rotate-180' : '',
          )}
        />
      </button>

      {open && (
        <div className="p-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          {error && (
            <div className="rounded-md bg-red-50 p-2 mb-3 text-sm text-red-700 border border-red-200 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap -mx-2">
            {visibleFields.map(({ field, state }) => (
              <div key={field.id} className={`${colClassFor(field.props)} mb-3`}>
                <label htmlFor={field.name} className="label">
                  {field.label}
                  {state.required && <span className="text-red-600 ml-0.5">*</span>}
                </label>
                <FieldRenderer
                  field={field}
                  value={values[field.name]}
                  // §4.14 — read-only via resolved permission, §4.12 — via a
                  // readonlyWhen condition, and derived fields (computed/fetched)
                  // are read-only since their value isn't hand-entered — unless the
                  // derive is an editable prefill/generate (e.g. MCA number) that
                  // the user may override afterwards.
                  readonly={
                    readonly ||
                    field.permission === 'view' ||
                    state.readonly ||
                    (field.derive != null && !isEditableDerive(parseDerive(field.derive)))
                  }
                  requiredOverride={state.required}
                  minBound={state.min}
                  maxBound={state.max}
                  onChange={(v) => onChange(field.name, v)}
                  entityType={entityType}
                  entityId={entityId}
                  values={values}
                />
              </div>
            ))}
          </div>

          {!readonly && (
            <div className="flex justify-end items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
              {savedAt && !saving && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Saved {savedAt.toLocaleTimeString()}
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={clsx(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r hover:brightness-105',
                  accent.bar,
                )}
              >
                {saving ? 'Saving…' : `Save ${accordion.title}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
