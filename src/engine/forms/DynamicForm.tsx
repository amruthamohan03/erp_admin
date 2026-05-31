'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { FormFieldRow } from '@/db/schema';
import type { FormDefinitionWithFields } from './index';
import { buildFormZodSchema } from './validation';

// React renderer for a form_definition_master_t + form_field_master_t form,
// completing §4.5. Server code uses buildFormZodSchema from ./validation to
// validate the same data — the contract is shared, the renderer is just
// the UI for it.
//
// Supported field_type values (must stay in sync with SUPPORTED_FIELD_TYPES
// in ./validation):
//   text, textarea, email, password, number, date, datetime, checkbox,
//   select, hidden.
//
// options_json for select accepts either ["A", "B"] or
// { "values": [{ "value": "IB", "label": "Import (IB)" }, ...] }.

export interface DynamicFormProps {
  form: FormDefinitionWithFields;
  initialValues?: Record<string, unknown>;
  /** Called with the Zod-validated values after submit succeeds locally. */
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
  /** Disables the submit button (e.g. while the server request is in flight). */
  busy?: boolean;
}

function defaultValueFor(field: FormFieldRow): unknown {
  if (field.defaultValue != null) {
    switch (field.fieldType) {
      case 'number': {
        const n = Number(field.defaultValue);
        return Number.isFinite(n) ? n : null;
      }
      case 'checkbox':
        return field.defaultValue === 'true' || field.defaultValue === '1';
      default:
        return field.defaultValue;
    }
  }
  switch (field.fieldType) {
    case 'checkbox':
      return false;
    case 'number':
      return null;
    default:
      return '';
  }
}

function buildInitial(
  form: FormDefinitionWithFields,
  override?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of form.fields) {
    out[f.fieldKey] = override && f.fieldKey in override
      ? override[f.fieldKey]
      : defaultValueFor(f);
  }
  return out;
}

function readOptions(
  optionsJson: unknown,
): Array<{ value: string; label: string }> {
  if (Array.isArray(optionsJson)) {
    return optionsJson.map((v) => ({ value: String(v), label: String(v) }));
  }
  if (
    optionsJson &&
    typeof optionsJson === 'object' &&
    'values' in optionsJson
  ) {
    const list = (optionsJson as { values: unknown }).values;
    if (Array.isArray(list)) {
      return list.map((item) => {
        if (item && typeof item === 'object') {
          const r = item as { value?: unknown; label?: unknown };
          return {
            value: String(r.value),
            label: String(r.label ?? r.value),
          };
        }
        return { value: String(item), label: String(item) };
      });
    }
  }
  return [];
}

export function DynamicForm({
  form,
  initialValues,
  onSubmit,
  submitLabel = 'Submit',
  busy,
}: DynamicFormProps) {
  const [values, setValues] = React.useState<Record<string, unknown>>(() =>
    buildInitial(form, initialValues),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  function setField(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);
    const validator = buildFormZodSchema(form.fields);
    const result = validator.safeParse(values);
    if (!result.success) {
      const flat = result.error.flatten();
      const errs: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        if (v && v.length > 0) errs[k] = v[0];
      }
      setErrors(errs);
      return;
    }
    try {
      await onSubmit(result.data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {form.fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          value={values[field.fieldKey]}
          onChange={(v) => setField(field.fieldKey, v)}
          error={errors[field.fieldKey]}
        />
      ))}
      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Submitting…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  error,
}: {
  field: FormFieldRow;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  if (field.fieldType === 'hidden') {
    return (
      <input
        type="hidden"
        name={field.fieldKey}
        value={value == null ? '' : String(value)}
      />
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.fieldKey}>
        {field.label}
        {field.required && <span className="text-destructive ms-1">*</span>}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.helpText && !error && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldRow;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = field.fieldKey;
  switch (field.fieldType) {
    case 'text':
    case 'email':
    case 'password':
      return (
        <Input
          id={id}
          type={field.fieldType === 'text' ? 'text' : field.fieldType}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={value == null || value === '' ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') onChange(null);
            else {
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : raw);
            }
          }}
        />
      );
    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'datetime':
      return (
        <Input
          id={id}
          type="datetime-local"
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'checkbox':
      return (
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      );
    case 'select': {
      const options = readOptions(field.optionsJson);
      return (
        <SearchableSelect
          value={value == null ? '' : String(value)}
          onChange={(v) => onChange(v)}
          options={options}
          placeholder={field.helpText ?? 'Select…'}
        />
      );
    }
    default:
      return (
        <p className="text-sm text-destructive">
          Unsupported field_type: {field.fieldType}
        </p>
      );
  }
}
