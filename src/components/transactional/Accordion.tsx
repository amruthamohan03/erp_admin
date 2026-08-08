'use client';

import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { PageAccordionDef, PageFieldDef } from '@/types';
import type { FieldState } from '@/lib/pages/conditions';
import { parseDerive, isEditableDerive } from '@/lib/pages/derive';
import { accentFor } from './accents';
import FieldRenderer from './FieldRenderer';

// §4.17 — presentational only. The accordion renders fields and reports clicks; it
// owns no save button and no save state, because a transaction page has exactly one
// Save that commits every section together. Open/closed and the resolved field
// states are lifted to TransactionalPage, which needs both to build the payload and
// to reveal the section holding a validation error.

export interface ResolvedField {
  field: PageFieldDef;
  state: FieldState;
}

interface AccordionProps {
  accordion: PageAccordionDef;
  values: Record<string, unknown>;
  onChange: (fieldName: string, value: unknown) => void;
  /** Fields with their conditions already resolved, computed once by the page. */
  resolved: ResolvedField[];
  open: boolean;
  onToggle: () => void;
  /** Field names that failed server validation — highlighted after a failed save. */
  invalidFields?: ReadonlySet<string>;
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
  resolved,
  open,
  onToggle,
  invalidFields,
  accentIndex = 0,
  entityType,
  entityId,
}: AccordionProps) {
  const readonly = accordion.permission === 'view';
  const accent = accentFor(accentIndex);
  const visibleFields = resolved.filter((r) => r.state.visible);
  const errorCount = invalidFields
    ? visibleFields.filter((r) => invalidFields.has(r.field.name)).length
    : 0;

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
        onClick={onToggle}
        aria-expanded={open}
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

        {/* A single page-level Save means an error can sit in a section the user
            cannot see — mark the header so a collapsed section still shows it. */}
        {errorCount > 0 && (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {errorCount} error{errorCount === 1 ? '' : 's'}
          </span>
        )}

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
          <div className="flex flex-wrap -mx-2">
            {visibleFields.map(({ field, state }) => (
              <div key={field.id} className={`${colClassFor(field.props)} mb-3`}>
                {/* §4.18 — the `required` class renders the star; never type one
                    into the label text. */}
                <label htmlFor={field.name} className={clsx('label', state.required && 'required')}>
                  {field.label}
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
                  invalid={invalidFields?.has(field.name)}
                />
                {invalidFields?.has(field.name) && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">This field needs a value.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
