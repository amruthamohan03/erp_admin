'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { Role } from '@/types';

type Permission = 'view' | 'edit' | 'hidden';

interface FormDef {
  id: number;
  formKey: string;
  name: string;
  description: string | null;
  entityType: string;
}

interface FieldRow {
  field_id: number;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  display_order: number;
  permission: Permission;
}

// Per-field, per-role permission matrix for form_field_role_t.
//
// Pick a form, then a role; the matrix loads every field of the form with
// its current effective permission ('edit' when no row exists). Toggle
// permissions per field, hit Save — server upserts non-default rows and
// deletes ones reset to 'edit' so the table stays free of no-op grants.

export default function FieldGrantsMappingPage() {
  const [forms, setForms] = useState<FormDef[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formId, setFormId] = useState<string>('');
  const [roleId, setRoleId] = useState<string>('');

  const [rows, setRows] = useState<FieldRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Forms + roles list in one effect so the two pickers light up together.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fr, rr] = await Promise.all([
          fetch('/api/v1/forms').then((r) => r.json()),
          fetch('/api/v1/roles').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (fr.ok) setForms(fr.data);
        else setError(fr.error?.message ?? 'Failed to load forms');
        if (rr.ok) setRoles(rr.data);
        else setError((prev) => prev ?? rr.error?.message ?? 'Failed to load roles');
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoadingDeps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMatrix = useCallback(async (fid: number, rid: number) => {
    setLoadingRows(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/v1/form-field-grants?form_id=${fid}&role_id=${rid}`,
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Failed to load matrix');
        setRows([]);
        return;
      }
      setRows(json.data.fields);
      setDirty(false);
    } catch {
      setError('Network error');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  // Reload the matrix whenever the chosen form or role changes. Clears local
  // state when either picker resets so the matrix doesn't show stale rows.
  useEffect(() => {
    if (!formId || !roleId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      setDirty(false);
      return;
    }
    loadMatrix(Number(formId), Number(roleId));
  }, [formId, roleId, loadMatrix]);

  function setPermission(fieldId: number, permission: Permission) {
    setRows((prev) =>
      prev.map((r) => (r.field_id === fieldId ? { ...r, permission } : r)),
    );
    setDirty(true);
    setNotice(null);
  }

  function setAll(permission: Permission) {
    setRows((prev) => prev.map((r) => ({ ...r, permission })));
    setDirty(true);
    setNotice(null);
  }

  async function handleSave() {
    if (!formId || !roleId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        form_id: Number(formId),
        role_id: Number(roleId),
        grants: rows.map((r) => ({
          field_id: r.field_id,
          permission: r.permission,
        })),
      };
      const res = await fetch('/api/v1/form-field-grants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Save failed');
        return;
      }
      setDirty(false);
      setNotice(
        `Saved — ${json.data.upserted} grants, ${json.data.cleared} cleared.`,
      );
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  const selectedForm = forms.find((f) => String(f.id) === formId);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            Field-level Role Grants
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Override per-field permission (view / edit / hidden) per role. Absent
            grants default to <code>edit</code> — i.e. the table only stores
            non-default rows.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!formId || !roleId || !dirty || saving || loadingRows}
          className="btn-primary"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div>
            <label className="label">Form</label>
            <SearchableSelect
              value={formId}
              onChange={(v) => setFormId(v)}
              options={forms.map((f) => ({
                value: String(f.id),
                label: `${f.name} (${f.entityType})`,
              }))}
              placeholder={loadingDeps ? 'Loading forms…' : 'Select a form…'}
              emptyLabel="— Select a form —"
            />
            {selectedForm?.description && (
              <p className="text-xs text-slate-500 mt-1">
                {selectedForm.description}
              </p>
            )}
          </div>
          <div>
            <label className="label">Role</label>
            <SearchableSelect
              value={roleId}
              onChange={(v) => setRoleId(v)}
              options={roles.map((r) => ({
                value: String(r.id),
                label: r.role_name,
              }))}
              placeholder={loadingDeps ? 'Loading roles…' : 'Select a role…'}
              emptyLabel="— Select a role —"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
          {notice}
        </div>
      )}

      {formId && roleId && (
        <div className="card">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-600">
              {rows.length} field{rows.length === 1 ? '' : 's'} in this form
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAll('edit')}
                disabled={rows.length === 0 || loadingRows}
                className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Reset all to edit
              </button>
              <button
                onClick={() => setAll('view')}
                disabled={rows.length === 0 || loadingRows}
                className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                All view
              </button>
              <button
                onClick={() => setAll('hidden')}
                disabled={rows.length === 0 || loadingRows}
                className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                All hidden
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th>Field</th>
                  <th>Type</th>
                  <th className="text-center">Edit</th>
                  <th className="text-center">View</th>
                  <th className="text-center">Hidden</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500 py-8">
                      Loading fields…
                    </td>
                  </tr>
                )}
                {!loadingRows && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500 py-8">
                      No fields in this form.
                    </td>
                  </tr>
                )}
                {!loadingRows &&
                  rows.map((r, idx) => (
                    <tr key={r.field_id} className="hover:bg-slate-50">
                      <td className="text-slate-500 font-medium">{idx + 1}</td>
                      <td>
                        <div className="font-medium">{r.label}</div>
                        <code className="text-xs text-slate-500">
                          {r.field_key}
                          {r.required ? ' · required' : ''}
                        </code>
                      </td>
                      <td>
                        <span className="text-xs text-slate-500">
                          {r.field_type}
                        </span>
                      </td>
                      <PermRadioCell
                        fieldId={r.field_id}
                        permission={r.permission}
                        target="edit"
                        onChange={setPermission}
                      />
                      <PermRadioCell
                        fieldId={r.field_id}
                        permission={r.permission}
                        target="view"
                        onChange={setPermission}
                      />
                      <PermRadioCell
                        fieldId={r.field_id}
                        permission={r.permission}
                        target="hidden"
                        onChange={setPermission}
                      />
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function PermRadioCell({
  fieldId,
  permission,
  target,
  onChange,
}: {
  fieldId: number;
  permission: Permission;
  target: Permission;
  onChange: (fieldId: number, p: Permission) => void;
}) {
  const checked = permission === target;
  return (
    <td className="text-center">
      <input
        type="radio"
        name={`perm-${fieldId}`}
        className="h-4 w-4 border-slate-300 text-primary-600 focus:ring-primary-500"
        checked={checked}
        onChange={() => onChange(fieldId, target)}
        aria-label={target}
      />
    </td>
  );
}
