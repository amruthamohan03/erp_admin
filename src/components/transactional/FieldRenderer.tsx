'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { PageFieldDef } from '@/types';

interface FieldRendererProps {
  field: PageFieldDef;
  value: unknown;
  readonly: boolean;
  onChange: (next: unknown) => void;
  // §4.11 — entity context for file uploads (e.g. 'page:clients' + the row id
  // or 'new'). Used to key the S3 object and the files row.
  entityType?: string;
  entityId?: string;
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

export default function FieldRenderer({ field, value, readonly, onChange, entityType, entityId }: FieldRendererProps) {
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
          step={getString(field.props, 'step')}
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
      return (
        <FileUpload
          field={field}
          value={value}
          readonly={readonly}
          onChange={onChange}
          entityType={entityType}
          entityId={entityId}
        />
      );

    default:
      return <span className="text-xs text-amber-600">Unsupported field_type: {String(field.field_type)}</span>;
  }
}

// §4.11 — file field: presign → direct-to-S3 PUT → commit, storing the files.id
// as the field value. A committed value renders a masked "View File" link.
function FileUpload({ field, value, readonly, onChange, entityType, entityId }: FieldRendererProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = asString(value); // stored files.id, or ''
  const accept = getString(field.props, 'accept');

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // 1) register + presign
      const presignRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          entity_type: entityType ?? null,
          entity_id: entityId ?? null,
          // Name the stored file after this input field (e.g. 'id_nat_file.pdf').
          field_name: field.name,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok || !presign.success) throw new Error(presign.message || 'Could not start upload');
      const { file_id, upload_url, mode } = presign.data as {
        file_id: number; upload_url: string; mode: 's3' | 'local';
      };

      // 2) upload the bytes — to S3 directly, or to our local endpoint.
      const put = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);

      // 3) S3 needs a separate commit; the local endpoint commits itself.
      if (mode === 's3') {
        const commitRes = await fetch(`/api/files/${file_id}/commit`, { method: 'POST' });
        const commit = await commitRes.json();
        if (!commitRes.ok || !commit.success) throw new Error(commit.message || 'Commit failed');
      }

      onChange(String(file_id));
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {fileId && (
        <div className="mb-1 text-sm flex items-center gap-2">
          <a
            href={`/api/files/${fileId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            <FileText className="h-4 w-4" /> View File
          </a>
          {!readonly && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-red-600 hover:text-red-700">
              Remove
            </button>
          )}
        </div>
      )}
      {!readonly && (
        <input
          type="file"
          id={field.name}
          name={field.name}
          className="input"
          accept={accept}
          disabled={uploading}
          onChange={handleSelect}
        />
      )}
      {uploading && <p className="text-xs text-slate-500 mt-1">Uploading…</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
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
    // Some master endpoints are server-paginated ({ data: { items, total } });
    // request a large page so the dropdown is populated, and accept either a flat
    // `data` array or a `data.items` array.
    const url = `/api/${source}${source.includes('?') ? '&' : '?'}pageSize=1000`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.items)
            ? json.data.items
            : null;
        if (json?.success && list) {
          const opts = list.map((row: Record<string, unknown>) => {
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
