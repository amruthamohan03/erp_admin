'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Plus, Settings, X } from 'lucide-react';
import type { PageFieldDef } from '@/types';
import PartielleManageModal from '@/modules/imports/PartielleManageModal';
import McaRefGrid from '@/modules/payments/McaRefGrid';
import type { McaLine } from '@/db/schema';
import SealPickerControl from '@/components/ui/SealPickerControl';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';

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
  // §4.18 — the server rejected this field on the last save; highlight it even
  // though the browser's own `:user-invalid` may not have fired.
  invalid?: boolean;
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

// Form values arrive as strings from selects and as numbers from the API. `pay_for`
// is a 0-based code, so zero has to survive — hence the explicit opt-in rather
// than a truthiness check.
function toId(v: unknown, { allowZero = false }: { allowZero?: boolean } = {}): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 0 && !allowZero ? null : n;
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
  invalid,
}: FieldRendererProps) {
  const effectiveRequired = requiredOverride ?? field.required;
  // Spread into every control, so the §4.18 error highlight reaches each field type
  // from one place. Native controls also self-mark via `:user-invalid`; this covers
  // the server-driven case.
  const baseProps = {
    id: field.name,
    name: field.name,
    required: effectiveRequired,
    disabled: readonly,
    'aria-invalid': invalid || undefined,
  };

  switch (field.field_type) {
    case 'text':
      return (
        <TextField
          field={field}
          value={value}
          readonly={readonly}
          onChange={onChange}
          requiredOverride={effectiveRequired}
          entityId={entityId}
          invalid={invalid}
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
          invalid={invalid}
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
          invalid={invalid}
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
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.map((opt) => (
            <Toggle
              key={opt.value}
              size="sm"
              label={opt.label}
              disabled={readonly}
              checked={current.has(opt.value)}
              onChange={(v) => toggle(opt.value, v)}
            />
          ))}
        </div>
      );
    }

    // §2 step 6 — the payment request's reference lines. Reads client / category
    // / expense type off the form so its two checks (exists for this client, not
    // already consumed) scope themselves as those fields change.
    case 'mca-grid':
      return (
        <McaRefGrid
          value={Array.isArray(value) ? (value as McaLine[]) : []}
          onChange={(lines) => onChange(lines)}
          readonly={readonly}
          invalid={invalid}
          clientId={toId(values?.['client_id'])}
          payFor={toId(values?.['pay_for'], { allowZero: true })}
          expenseType={toId(values?.['expense_type'])}
          locationId={toId(values?.['location_id'])}
          paymentId={entityId && entityId !== 'new' ? Number(entityId) : null}
        />
      );

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

// Text input, with an optional live uniqueness check driven by config rather than
// by a per-field special case: `props.unique` names a resource under
// /api/v1/uniqueness/{resource} (e.g. 'license-numbers') and the field debounces a
// check against it while the operator types. The database constraint is still the
// authority — this only moves the "already exists" answer from save time to typing
// time, where it costs nothing to fix.
function TextField({ field, value, readonly, onChange, requiredOverride, entityId, invalid }: FieldRendererProps) {
  const uppercase = getBool(field.props, 'uppercase');
  const uniqueResource = getString(field.props, 'unique');
  const text = asString(value);

  // Editing an existing row must not collide with itself.
  const excludeId = entityId && entityId !== 'new' ? Number(entityId) : null;
  const { status, message } = useUniqueCheck({
    resource: uniqueResource ?? '',
    // An empty value keeps the hook idle, so a field without `unique` never fires.
    value: uniqueResource ? text : '',
    excludeId: Number.isFinite(excludeId) ? excludeId : null,
  });
  const taken = status === 'taken';

  return (
    <div>
      <input
        type="text"
        id={field.name}
        name={field.name}
        required={requiredOverride ?? field.required}
        disabled={readonly}
        aria-invalid={invalid || taken || undefined}
        className={`input${uppercase ? ' uppercase' : ''}`}
        value={text}
        minLength={getNumber(field.props, 'minLength')}
        maxLength={getNumber(field.props, 'maxLength')}
        pattern={getString(field.props, 'pattern')}
        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      />
      {uniqueResource && !readonly && status !== 'idle' && (
        <p
          className={`mt-1 text-xs ${
            taken || status === 'error'
              ? 'text-red-600 dark:text-red-400'
              : status === 'available'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground dark:text-muted-foreground'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

// §4.11 — file field: one multipart POST to /api/v1/files, storing the returned
// files.id as the field value. A stored value renders a masked "View File" link.
//
// This deliberately matches what the endpoint implements. It previously spoke a
// presign → direct PUT → commit protocol that does not exist here: the route
// reads `req.formData()` and writes the bytes itself in a single round-trip, and
// there is no /files/{id}/commit route at all. Every upload therefore failed on
// the first call, project-wide.
function FileUpload({ field, value, readonly, onChange, entityType, entityId }: FieldRendererProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = asString(value); // stored files.id, or ''
  const accept = getString(field.props, 'accept');
  const maxSizeKb = getNumber(field.props, 'maxSizeKb');

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;

    // Checked here as well as server-side so an oversized file fails instantly
    // rather than after uploading the bytes.
    if (maxSizeKb && file.size > maxSizeKb * 1024) {
      setError(`File is larger than the ${Math.round(maxSizeKb / 1024)} MB limit`);
      e.target.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      // Keys the stored object to the record this field belongs to.
      if (entityType) body.append('entity_type', entityType);
      if (entityId) body.append('entity_id', entityId);

      // No Content-Type header — the browser sets it with the multipart boundary.
      const result = await safeFetchJson<{ id: number }>('/api/v1/files', { method: 'POST', body });
      if (!result.ok) throw new Error(result.message);
      onChange(String(result.data.id));
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
      // Let the same file be re-picked after a failure.
      e.target.value = '';
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
      {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
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

function DynamicSelect({ field, value, readonly, onChange, requiredOverride, values, invalid }: DynamicSelectProps) {
  const staticOptions = (field.options_static ?? []) as Array<{ value: string; label: string }>;
  const source = field.options_source;
  const labelField = field.options_label_field ?? 'name';
  const labelTemplate = getString(field.props, 'labelTemplate');
  const quickAdd = parseQuickAdd(field.props);

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
  // A failed options fetch used to be swallowed, which rendered exactly like a
  // master with no rows: an empty dropdown saying "No matches". The two need to
  // look different — one is a data state the user can fix, the other is a fault
  // they should report.
  const [loadError, setLoadError] = useState<string | null>(null);

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
    safeFetchJson<unknown>(url)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.message);
          setDynamic([]);
          return;
        }
        const data = result.data as unknown;
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { items?: unknown[] })?.items)
            ? (data as { items: unknown[] }).items
            : null;
        if (!list) {
          setLoadError('Options could not be read');
          setDynamic([]);
          return;
        }
        setLoadError(null);
        setDynamic(
          (list as Record<string, unknown>[]).map((row) => {
            const v = row['id'] as string | number;
            const label = labelTemplate
              ? labelTemplate.replace(/\{(\w+)\}/g, (_, k: string) => String(row[k] ?? ''))
              : String(row[labelField] ?? row[labelField.replace('_', '')] ?? v);
            return { value: v, label };
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, labelField, labelTemplate, paramQuery]);

  // Order is SearchableSelect's job (§4.16) — id order for entity-backed lists,
  // authored order for static ones. Pre-sorting here is what used to alphabetise
  // a static option list whose sequence was deliberate.
  const options = source ? dynamic : staticOptions.map((o) => ({ value: o.value, label: o.label }));

  const select = (
    <SearchableSelect
      id={field.name}
      className={quickAdd ? 'flex-1' : undefined}
      aria-label={field.label}
      required={requiredOverride ?? field.required}
      invalid={invalid || !!loadError}
      disabled={readonly || (source != null && loading)}
      value={asString(value)}
      emptyLabel="— Select —"
      placeholder={
        source != null && loading ? 'Loading…' : loadError ? 'Options unavailable' : '— Select —'
      }
      options={options.map((opt) => ({ value: String(opt.value), label: String(opt.label) }))}
      onChange={(v) => onChange(v === '' ? null : v)}
    />
  );

  const withError = loadError ? (
    <div>
      {select}
      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
        Could not load options: {loadError}
      </p>
    </div>
  ) : (
    select
  );

  if (!quickAdd || !source) return withError;

  return (
    <QuickAddSelect
      config={quickAdd}
      source={source}
      labelField={labelField}
      readonly={readonly}
      onAdded={(option) => {
        // Append rather than refetch: the new row is selected immediately, and the
        // next natural options fetch reconciles the list anyway.
        setDynamic((prev) => [...prev, option]);
        onChange(String(option.value));
      }}
    >
      {withError}
    </QuickAddSelect>
  );
}

// §4.1 — a select whose master can be extended without leaving the form. Config,
// not a per-field component: `props.quickAdd` = { field, title?, placeholder? }
// names the column the create endpoint expects, and the POST goes to the field's
// OWN `options_source` (e.g. /api/v1/origins), so any master with a single-name
// create endpoint opts in with one config row.
interface QuickAddConfig {
  /** Column the create endpoint expects, e.g. 'origin_name'. */
  field: string;
  title?: string;
  placeholder?: string;
}

function parseQuickAdd(props: Props): QuickAddConfig | null {
  const raw = props?.['quickAdd'];
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Record<string, unknown>;
  return typeof cfg.field === 'string' && cfg.field
    ? {
        field: cfg.field,
        title: typeof cfg.title === 'string' ? cfg.title : undefined,
        placeholder: typeof cfg.placeholder === 'string' ? cfg.placeholder : undefined,
      }
    : null;
}

function QuickAddSelect({
  config,
  source,
  labelField,
  readonly,
  onAdded,
  children,
}: {
  config: QuickAddConfig;
  source: string;
  labelField: string;
  readonly: boolean;
  onAdded: (option: { value: string | number; label: string }) => void;
  children: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [config.field]: name }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || json.data?.id == null) {
        throw new Error(json?.error?.message || `Could not add (HTTP ${res.status})`);
      }
      const row = json.data as Record<string, unknown>;
      onAdded({ value: row.id as string | number, label: String(row[labelField] ?? name) });
      setDraft('');
      setAdding(false);
    } catch (e) {
      setError((e as Error).message || 'Could not add');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {children}
        {!readonly && (
          <button
            type="button"
            title={config.title ?? 'Add a new option'}
            aria-label={config.title ?? 'Add a new option'}
            onClick={() => setAdding((v) => !v)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {adding && !readonly && (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="input flex-1"
              placeholder={config.placeholder ?? 'New value'}
              value={draft}
              disabled={busy}
              // Enter must not bubble to the page form, which would fire the
              // single page-level Save (§4.17) instead of adding the option.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setAdding(false);
                }
              }}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !draft.trim()}
              aria-label="Save new option"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              disabled={busy}
              aria-label="Cancel"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// §5 PARTIELLE picker — licence-scoped dropdown + inline "+" create. Options come
// from /api/v1/partielle-options?license_id= (value = partial_name, the string
// link stored in inspection_reports). The "+" posts a new allotment to
// /api/v1/partielles, then reloads and selects it — no external menu needed.
function PartiellePicker({ field, value, readonly, onChange, requiredOverride, values, invalid }: DynamicSelectProps) {
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
        // Unsorted on purpose — SearchableSelect puts them in id order (§4.16).
        setOptions(
          j.data.map((o: { id: unknown; label: unknown }) => ({
            value: String(o.id),
            label: String(o.label),
          })),
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
        <SearchableSelect
          id={field.name}
          className="flex-1"
          aria-label={field.label}
          required={requiredOverride ?? field.required}
          invalid={invalid}
          disabled={readonly || loading}
          value={asString(value)}
          emptyLabel={licenseId ? '— Select PARTIELLE —' : 'Select License First'}
          placeholder={licenseId ? '— Select PARTIELLE —' : 'Select License First'}
          options={options.map((o) => ({ value: String(o.value), label: String(o.label) }))}
          onChange={(v) => onChange(v === '' ? null : v)}
        />
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
