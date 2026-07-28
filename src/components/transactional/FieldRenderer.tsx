'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Settings } from 'lucide-react';
import type { PageFieldDef } from '@/types';
import PartielleManageModal from '@/modules/imports/PartielleManageModal';
import SealPickerControl from '@/components/ui/SealPickerControl';

interface FieldRendererProps {
  field: PageFieldDef;
  value: unknown;
  readonly: boolean;
  onChange: (next: unknown) => void;
  // §4.11 — entity context for file uploads (e.g. 'page:clients' + the row id
  // or 'new'). Used to key the S3 object and the files row.
  entityType?: string;
  entityId?: string;
  // §4.12 — config-driven overrides resolved from the field's `conditions`
  // against the current form values. `requiredOverride` reflects requiredWhen;
  // `minBound`/`maxBound` constrain date/number inputs (e.g. expiry ≥ validation,
  // invoice ≤ today). Absent ⇒ fall back to the static field/props values.
  requiredOverride?: boolean;
  minBound?: string | number;
  maxBound?: string | number;
  // §4.5 — current form state, so a select with `props.optionsParams` can filter
  // its options by another field (e.g. Regime filtered by the selected client).
  values?: Record<string, unknown>;
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

export default function FieldRenderer({
  field,
  value,
  readonly,
  onChange,
  entityType,
  entityId,
  requiredOverride,
  minBound,
  maxBound,
  values,
}: FieldRendererProps) {
  const effectiveRequired = requiredOverride ?? field.required;
  const baseProps = {
    id: field.name,
    name: field.name,
    required: effectiveRequired,
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
          min={typeof minBound === 'number' ? minBound : getNumber(field.props, 'min')}
          max={typeof maxBound === 'number' ? maxBound : getNumber(field.props, 'max')}
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
          min={minBound !== undefined ? String(minBound) : undefined}
          max={maxBound !== undefined ? String(maxBound) : undefined}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'select':
      return (
        <DynamicSelect
          field={field}
          value={value}
          readonly={readonly}
          onChange={onChange}
          requiredOverride={effectiveRequired}
          values={values}
        />
      );

    // §5 PARTIELLE — a licence-scoped allotment dropdown with an inline "+" to
    // create a new allotment on the form (mirrors main's import PARTIELLE input).
    case 'partielle-picker':
      return (
        <PartiellePicker
          field={field}
          value={value}
          readonly={readonly}
          onChange={onChange}
          requiredOverride={effectiveRequired}
          values={values}
        />
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

    case 'seal-picker':
      return (
        <SealPicker
          field={field}
          value={value}
          readonly={readonly}
          onChange={onChange}
          requiredOverride={effectiveRequired}
        />
      );

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
      const presignRes = await fetch('/api/v1/files', {
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
      if (!presignRes.ok || !presign.ok) throw new Error(presign.error?.message || 'Could not start upload');
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
        const commitRes = await fetch(`/api/v1/files/${file_id}/commit`, { method: 'POST' });
        const commit = await commitRes.json();
        if (!commitRes.ok || !commit.ok) throw new Error(commit.error?.message || 'Commit failed');
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
            href={`/api/v1/files/${fileId}/view`}
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

// §legacy — DGDA seal picker. Thin adapter over the shared SealPickerControl
// (§4.10) that maps FieldRenderer's value/onChange contract to it. The value is
// the comma-joined seal numbers; number_of_seals auto-counts via a `count` derive.
function SealPicker({ field, value, readonly, onChange }: FieldRendererProps) {
  return (
    <SealPickerControl
      id={field.name}
      value={asString(value)}
      readonly={readonly}
      onChange={(v) => onChange(v)}
    />
  );
}

type DynamicSelectProps = FieldRendererProps;

function DynamicSelect({ field, value, readonly, onChange, requiredOverride, values }: DynamicSelectProps) {
  const staticOptions = (field.options_static ?? []) as Array<{ value: string; label: string }>;
  const source = field.options_source;
  const labelField = field.options_label_field ?? 'name';
  const labelTemplate = getString(field.props, 'labelTemplate');

  // §4.5 — dependent options. `props.optionsParams` maps a query-param name to the
  // form field whose value supplies it (e.g. { "client_id": "client_id" }). Each
  // non-empty mapped value is appended to the options request, so the endpoint can
  // scope the list (e.g. /api/regimes?client_id=42 → only that client's regimes).
  const optionsParams =
    field.props && typeof field.props === 'object'
      ? ((field.props as Record<string, unknown>)['optionsParams'] as Record<string, string> | undefined)
      : undefined;
  const paramQuery = (() => {
    if (!optionsParams) return '';
    const sp = new URLSearchParams();
    for (const [param, formField] of Object.entries(optionsParams)) {
      const v = values ? values[formField] : undefined;
      if (v !== null && v !== undefined && v !== '') sp.set(param, String(v));
    }
    return sp.toString();
  })();

  const [dynamic, setDynamic] = useState<Array<{ value: string | number; label: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // Some master endpoints are server-paginated ({ data: { items, total } });
    // request the largest page every list endpoint accepts so the dropdown is
    // populated, and accept either a flat `data` array or a `data.items` array.
    // NOTE: the list-query Zod schemas cap pageSize at 100 (a couple at 500) and
    // *throw* on an over-cap value, which surfaces as a 422 and an empty dropdown.
    // 100 is the universal ceiling — do not raise it here without raising the
    // endpoint caps too. TODO(dropdown): switch to a server-side searchable
    // select for entities that can exceed 100 rows (clients, licenses).
    const url = `/api/v1/${source}${source.includes('?') ? '&' : '?'}pageSize=100${paramQuery ? `&${paramQuery}` : ''}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.items)
            ? json.data.items
            : null;
        if (json?.ok && list) {
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
  }, [source, labelField, labelTemplate, paramQuery]);

  // All dropdowns render their options in ascending (A→Z, numeric-aware) order.
  const options = (source ? dynamic : staticOptions.map((o) => ({ value: o.value, label: o.label })))
    .slice()
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <select
      id={field.name}
      name={field.name}
      required={requiredOverride ?? field.required}
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

// §5 PARTIELLE picker — licence-scoped dropdown + inline "+" create. Options come
// from /api/v1/partielle-options?license_id= (value = partial_name, the string
// link stored in inspection_reports). The "+" posts a new allotment to
// /api/v1/partielles, then reloads and selects it — no external menu needed.
function PartiellePicker({ field, value, readonly, onChange, requiredOverride, values }: DynamicSelectProps) {
  const licenseId =
    values && values['license_id'] != null && values['license_id'] !== '' ? Number(values['license_id']) : null;

  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!licenseId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const j = await fetch(`/api/v1/partielle-options?license_id=${licenseId}`).then((r) => r.json());
      if (j?.ok && Array.isArray(j.data)) {
        setOptions(
          j.data
            .map((o: { id: unknown; label: unknown }) => ({ value: String(o.id), label: String(o.label) }))
            .sort((a: { label: string }, b: { label: string }) =>
              a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }),
            ),
        );
      }
    } catch {
      // leave empty
    } finally {
      setLoading(false);
    }
  }, [licenseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOptions();
  }, [loadOptions]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          id={field.name}
          name={field.name}
          required={requiredOverride ?? field.required}
          disabled={readonly || loading}
          className="input"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{licenseId ? '— Select PARTIELLE —' : 'Select License First'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!readonly && (
          <button
            type="button"
            title={licenseId ? 'Manage PARTIELLE allotments' : 'Select a licence first'}
            disabled={!licenseId}
            onClick={() => setShowManage(true)}
            className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
      {showManage && licenseId != null && (
        <PartielleManageModal
          licenseId={licenseId}
          onClose={() => setShowManage(false)}
          onChanged={() => loadOptions()}
        />
      )}
    </div>
  );
}
