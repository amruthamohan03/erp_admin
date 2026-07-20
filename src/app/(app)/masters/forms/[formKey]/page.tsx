'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit2,
  FileCog,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

// /masters/forms/[formKey] — per-form editor. Two sections:
//   1. Header (name / description / entity_type) — inline edit,
//      PUT on save.
//   2. Fields table — add / edit / soft-delete via nested /fields
//      endpoints.
//
// JSON blobs (validation_json, options_json) are edited as raw JSON
// in a textarea. That's the honest choice — the token bag has too
// many shapes across field types for a schema-driven editor to be
// worth it right now, and admins configuring dynamic forms should
// be comfortable with JSON. Parse errors are surfaced inline.

interface FormDefinition {
  id: number;
  formKey: string;
  name: string;
  description: string | null;
  entityType: string;
  fields: FormFieldRow[];
}

interface FormFieldRow {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
  validationJson: unknown;
  optionsJson: unknown;
  displayOrder: number;
}

const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'password',
  'number',
  'date',
  'datetime',
  'checkbox',
  'select',
  'hidden',
] as const;

export default function FormDefinitionEditor({
  params,
}: {
  params: Promise<{ formKey: string }>;
}) {
  const { formKey } = use(params);
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<FormFieldRow | null>(
    null,
  );

  // Header edit state — mirrors the loaded values; PUT sends only
  // the header fields on save.
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [description, setDescription] = useState('');
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerDirty, setHeaderDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/forms/${formKey}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Failed to load form');
        return;
      }
      const f = json.data as FormDefinition;
      setForm(f);
      setName(f.name);
      setEntityType(f.entityType);
      setDescription(f.description ?? '');
      setHeaderDirty(false);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [formKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveHeader() {
    setHeaderSaving(true);
    try {
      const res = await fetch(`/api/v1/forms/${formKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          entity_type: entityType,
          description: description || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(json.error?.message || 'Save failed');
        return;
      }
      load();
    } finally {
      setHeaderSaving(false);
    }
  }

  async function deleteField(field: FormFieldRow) {
    if (!confirm(`Disable field "${field.fieldKey}"?`)) return;
    const res = await fetch(
      `/api/v1/forms/${formKey}/fields/${field.id}`,
      { method: 'DELETE' },
    );
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message || 'Delete failed');
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-20 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading form...
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="card p-6 text-sm text-red-700">
        {error ?? 'Form not found'}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/masters/forms"
            className="text-xs text-slate-500 hover:text-primary-600 inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to forms
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCog className="h-6 w-6 text-primary-600" />
            <code className="text-lg">{form.formKey}</code>
          </h1>
        </div>
      </div>

      {/* ── Header edit ─────────────────────────────────────────── */}
      <div className="card p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Definition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHeaderDirty(true);
              }}
            />
          </div>
          <div>
            <label className="label">Entity Type *</label>
            <input
              className="input"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setHeaderDirty(true);
              }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setHeaderDirty(true);
              }}
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={saveHeader}
            disabled={!headerDirty || headerSaving}
            className="btn-primary disabled:opacity-50"
          >
            {headerSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </div>

      {/* ── Fields table ────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">
            Fields ({form.fields.length})
          </h2>
          <button
            onClick={() => setShowAddField(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add Field
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">Order</th>
                <th>Field Key</th>
                <th>Label</th>
                <th>Type</th>
                <th>Required</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {form.fields.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    No fields yet. Add one to define this form.
                  </td>
                </tr>
              )}
              {form.fields.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="font-mono text-xs text-slate-500">
                    {f.displayOrder}
                  </td>
                  <td>
                    <code className="text-xs text-slate-700">{f.fieldKey}</code>
                  </td>
                  <td className="font-medium">{f.label}</td>
                  <td>
                    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {f.fieldType}
                    </span>
                  </td>
                  <td>
                    {f.required ? (
                      <span className="text-xs text-red-600">Required</span>
                    ) : (
                      <span className="text-xs text-slate-400">Optional</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingField(f)}
                      className="text-slate-500 hover:text-primary-600 p-1"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteField(f)}
                      className="text-slate-500 hover:text-red-600 p-1 ml-1"
                      title="Disable"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddField && (
        <FieldModal
          formKey={formKey}
          onClose={() => setShowAddField(false)}
          onSaved={() => {
            setShowAddField(false);
            load();
          }}
        />
      )}
      {editingField && (
        <FieldModal
          formKey={formKey}
          field={editingField}
          onClose={() => setEditingField(null)}
          onSaved={() => {
            setEditingField(null);
            load();
          }}
        />
      )}
    </>
  );
}

function FieldModal({
  formKey,
  field,
  onClose,
  onSaved,
}: {
  formKey: string;
  field?: FormFieldRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!field;
  const [fieldKey, setFieldKey] = useState(field?.fieldKey ?? '');
  const [label, setLabel] = useState(field?.label ?? '');
  const [fieldType, setFieldType] = useState<string>(
    field?.fieldType ?? 'text',
  );
  const [required, setRequired] = useState(field?.required ?? false);
  const [helpText, setHelpText] = useState(field?.helpText ?? '');
  const [defaultValue, setDefaultValue] = useState(field?.defaultValue ?? '');
  const [displayOrder, setDisplayOrder] = useState(
    field ? String(field.displayOrder) : '',
  );
  const [validationJson, setValidationJson] = useState(
    field?.validationJson ? JSON.stringify(field.validationJson, null, 2) : '',
  );
  const [optionsJson, setOptionsJson] = useState(
    field?.optionsJson ? JSON.stringify(field.optionsJson, null, 2) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function parseJson(raw: string, name: string): unknown {
    const s = raw.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (e) {
      throw new Error(
        `${name} is not valid JSON: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let validation: unknown;
      let options: unknown;
      try {
        validation = parseJson(validationJson, 'validation_json');
        options = parseJson(optionsJson, 'options_json');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }

      const body = {
        field_key: fieldKey,
        label,
        field_type: fieldType,
        required,
        default_value: defaultValue || null,
        help_text: helpText || null,
        validation_json: validation,
        options_json: options,
        display_order:
          displayOrder.trim() === '' ? undefined : Number(displayOrder),
      };

      const url = isEdit
        ? `/api/v1/forms/${formKey}/fields/${field!.id}`
        : `/api/v1/forms/${formKey}/fields`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Field' : 'Add Field'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Field Key *</label>
              <input
                className="input"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                required
                placeholder="license_number"
                pattern="[a-z][a-z0-9_]*"
              />
              <p className="text-xs text-slate-500 mt-1">
                snake_case; used as the JSON payload key.
              </p>
            </div>
            <div>
              <label className="label">Type *</label>
              <select
                className="input"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                required
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Label *</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                placeholder="License number"
              />
            </div>
            <div>
              <label className="label">Display Order</label>
              <input
                className="input"
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                placeholder="(auto — end)"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Required</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="label">Help Text</label>
              <input
                className="input"
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
                placeholder="Shown under the field in the UI."
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Default Value</label>
              <input
                className="input"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder="(none)"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">
                validation_json{' '}
                <span className="text-slate-400 font-normal">(JSON)</span>
              </label>
              <textarea
                className="input font-mono text-xs"
                rows={4}
                value={validationJson}
                onChange={(e) => setValidationJson(e.target.value)}
                placeholder='{ "required": true, "min": 3, "max": 255 }'
              />
              <p className="text-xs text-slate-500 mt-1">
                Tokens: required, min, max, pattern, enum, validationKey. See
                CLAUDE.md §4.5.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label">
                options_json{' '}
                <span className="text-slate-400 font-normal">(JSON)</span>
              </label>
              <textarea
                className="input font-mono text-xs"
                rows={4}
                value={optionsJson}
                onChange={(e) => setOptionsJson(e.target.value)}
                placeholder='[{ "value": "IB", "label": "Import" }, { "value": "Export", "label": "Export" }]'
              />
              <p className="text-xs text-slate-500 mt-1">
                For select/multiselect: static options or a{' '}
                <code>{`{ "source": "..." }`}</code> pointer.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
