'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { PageAccordionDef } from '@/types';
import { parseConditions, resolveFieldState } from '@/lib/pages/conditions';
import FieldRenderer from './FieldRenderer';

interface AccordionProps {
  accordion: PageAccordionDef;
  values: Record<string, unknown>;
  onChange: (fieldName: string, value: unknown) => void;
  // §4.12 — receives the names of the fields that are currently VISIBLE (per the
  // config-driven conditions) so a kind-hidden section isn't written on save.
  onSave: (visibleFieldNames: string[]) => Promise<void>;
  defaultOpen?: boolean;
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

export default function Accordion({ accordion, values, onChange, onSave, defaultOpen, entityType, entityId }: AccordionProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const readonly = accordion.permission === 'view';

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
    <div className="card mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3 text-left font-medium',
          open ? 'border-b border-slate-200' : '',
        )}
      >
        <span className="flex items-center gap-2 text-slate-900">
          {accordion.icon && <i className={accordion.icon} />}
          <span>{accordion.title}</span>
          {readonly && (
            <span className="text-[10px] uppercase rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">
              read-only
            </span>
          )}
        </span>
        <ChevronDown className={clsx('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open && (
        <div className="p-4">
          {error && (
            <div className="rounded-md bg-red-50 p-2 mb-3 text-sm text-red-700 border border-red-200">
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
                  // are always read-only since their value isn't hand-entered.
                  readonly={readonly || field.permission === 'view' || state.readonly || field.derive != null}
                  requiredOverride={state.required}
                  minBound={state.min}
                  maxBound={state.max}
                  onChange={(v) => onChange(field.name, v)}
                  entityType={entityType}
                  entityId={entityId}
                />
              </div>
            ))}
          </div>

          {!readonly && (
            <div className="flex justify-end items-center gap-3 pt-2 border-t border-slate-100 mt-2">
              {savedAt && !saving && (
                <span className="text-xs text-emerald-600">
                  Saved {savedAt.toLocaleTimeString()}
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving...' : `Save ${accordion.title}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
