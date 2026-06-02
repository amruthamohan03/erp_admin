'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { PageAccordionDef } from '@/types';
import FieldRenderer from './FieldRenderer';

interface AccordionProps {
  accordion: PageAccordionDef;
  values: Record<string, unknown>;
  onChange: (fieldName: string, value: unknown) => void;
  onSave: () => Promise<void>;
  defaultOpen?: boolean;
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

export default function Accordion({ accordion, values, onChange, onSave, defaultOpen }: AccordionProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const readonly = accordion.permission === 'view';

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave();
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
            {accordion.fields.map((field) => (
              <div key={field.id} className={`${colClassFor(field.props)} mb-3`}>
                <label htmlFor={field.name} className="label">
                  {field.label}
                  {field.required && <span className="text-red-600 ml-0.5">*</span>}
                </label>
                <FieldRenderer
                  field={field}
                  value={values[field.name]}
                  readonly={readonly}
                  onChange={(v) => onChange(field.name, v)}
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
