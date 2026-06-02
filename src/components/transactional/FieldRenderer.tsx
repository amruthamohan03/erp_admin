'use client';

import { useEffect, useState } from 'react';
import type { PageFieldDef } from '@/types';

interface FieldRendererProps {
  field: PageFieldDef;
  value: unknown;
  readonly: boolean;
  onChange: (next: unknown) => void;
}

type Props = Record<string, unknown> | null;

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function getNumber(props: Props, key: string): number | undefined {
  const v = props?.[key];
  return typeof v === 'number' ? v : undefined;
}

function getString(props: Props, key: string): string | undefined {
  const v = props?.[key];
  return typeof v === 'string' ? v : undefined;
}

function getBool(props: Props, key: string): boolean {
  return props?.[key] === true;
}

export default function FieldRenderer({ field, value, readonly, onChange }: FieldRendererProps) {
  const baseProps = {
    id: field.name,
    name: field.name,
    required: field.required,
    disabled: readonly,
  };

  switch (field.field_type) {
    case 'text':
      return (
        <input
          type="text"
          {...baseProps}
          className={`input${getBool(field.props, 'uppercase') ? ' uppercase' : ''}`}
          value={asString(value)}
          minLength={getNumber(field.props, 'minLength')}
          maxLength={getNumber(field.props, 'maxLength')}
          pattern={getString(field.props, 'pattern')}
          onChange={(e) => {
            const v = getBool(field.props, 'uppercase') ? e.target.value.toUpperCase() : e.target.value;
            onChange(v);
          }}
        />
      );

    case 'textarea': {
      const rows = getNumber(field.props, 'rows') ?? 3;
      return (
        <textarea
          {...baseProps}
          className="input"
          rows={rows}
          maxLength={getNumber(field.props, 'maxLength')}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    case 'email':
      return (
        <input
          type="email"
          {...baseProps}
          className="input"
          value={asString(value)}
          maxLength={getNumber(field.props, 'maxLength')}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'tel':
      return (
        <input
          type="tel"
          {...baseProps}
          className="input"
          value={asString(value)}
          maxLength={getNumber(field.props, 'maxLength')}
          pattern={getString(field.props, 'pattern')}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          {...baseProps}
          className="input"
          value={asString(value)}
          min={getNumber(field.props, 'min')}
          max={getNumber(field.props, 'max')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          {...baseProps}
          className="input"
          value={asString(value).slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'select':
      return (
        <DynamicSelect field={field} value={value} readonly={readonly} onChange={onChange} />
      );

    case 'checkbox-group': {
      const options = (field.options_static ?? []) as Array<{ value: string; label: string }>;
      const joinChar = getString(field.props, 'joinChar') ?? '';
      // The DB stores the joined string (e.g. 'IEL'). Decode to a set for the UI.
      const current = new Set<string>(asString(value).split(joinChar).filter(Boolean));
      function toggle(optValue: string, checked: boolean) {
        if (checked) current.add(optValue);
        else current.delete(optValue);
        // Re-encode in the order the options were declared so the saved string is stable.
        onChange(options.filter((o) => current.has(o.value)).map((o) => o.value).join(joinChar));
      }
      return (
        <div className="flex flex-wrap gap-3">
          {options.map((opt) => (
            <label key={opt.value} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                disabled={readonly}
                checked={current.has(opt.value)}
                onChange={(e) => toggle(opt.value, e.target.checked)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'file':
      // TODO(storage): hook this up to presignUpload per CLAUDE.md §4.11 once the
      // `files` table + S3 setup land. For now the file column on clients_t is a
      // varchar path mirroring the source dump.
      return (
        <input
          type="file"
          {...baseProps}
          className="input"
          accept={getString(field.props, 'accept')}
          onChange={(e) => onChange(e.target.files?.[0]?.name ?? null)}
        />
      );

    default:
      return <span className="text-xs text-amber-600">Unsupported field_type: {String(field.field_type)}</span>;
  }
}

interface DynamicSelectProps extends FieldRendererProps {}

function DynamicSelect({ field, value, readonly, onChange }: DynamicSelectProps) {
  const staticOptions = (field.options_static ?? []) as Array<{ value: string; label: string }>;
  const source = field.options_source;
  const labelField = field.options_label_field ?? 'name';
  const labelTemplate = getString(field.props, 'labelTemplate');

  const [dynamic, setDynamic] = useState<Array<{ value: string | number; label: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/${source}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          const opts = json.data.map((row: Record<string, unknown>) => {
            const v = row['id'] as string | number;
            let label = '';
            if (labelTemplate) {
              label = labelTemplate.replace(/\{(\w+)\}/g, (_, k: string) => String(row[k] ?? ''));
            } else {
              label = String(row[labelField] ?? row[labelField.replace('_', '')] ?? v);
            }
            return { value: v, label };
          });
          setDynamic(opts);
        }
      })
      .catch(() => {
        // Swallow; the dropdown will just be empty.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, labelField, labelTemplate]);

  const options = source ? dynamic : staticOptions.map((o) => ({ value: o.value, label: o.label }));

  return (
    <select
      id={field.name}
      name={field.name}
      required={field.required}
      disabled={readonly || (source != null && loading)}
      className="input"
      value={asString(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">— Select —</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
