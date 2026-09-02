'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import type { Role } from '@/types';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/roles');
      const json = await res.json();
      if (json.ok) setRoles(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);



  async function handleDelete(id: number) {
    if (!confirm('Disable this role?')) return;
    const res = await fetch(`/api/v1/roles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This role could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The role has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Roles</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Role
        </button>
      </div>

      <DataTable<Role>
        rows={roles}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search role, parent..."
        emptyMessage="No record yet — create the first one."
        columns={[
        { key: 'role_name', header: 'Role Name', sortable: true, className: 'font-medium' },
        { key: 'parent_role_name', header: 'Parent', render: (r: Role) => (
            <>
            {r.parent_role_name || '-'}
            </>
          ) },
        { key: 'approval_level', header: 'Approval Level', render: (r: Role) => (
            <>
            {r.approval_level ?? '-'}
            </>
          ) },
        { key: 'department', header: 'Department', render: (r: Role) => (
            <>
            <Flag on={!!r.department} />
            </>
          ) },
        { key: 'management', header: 'Management', render: (r: Role) => (
            <>
            <Flag on={!!r.management} />
            </>
          ) },
        { key: 'finance', header: 'Finance', render: (r: Role) => (
            <>
            <Flag on={!!r.finance} />
            </>
          ) },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
      />

      {showCreate && (
        <RoleFormModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); setResult({ status: 'success', title: 'Created', message: 'The role has been created.' }); }}
        />
      )}

      {editing && (
        <RoleFormModal
          roles={roles}
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); setResult({ status: 'success', title: 'Saved', message: 'Your changes to this role have been saved.' }); }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${on ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
      {on ? 'Yes' : 'No'}
    </span>
  );
}

function RoleFormModal({
  role,
  roles,
  onClose,
  onSaved,
}: {
  role?: Role;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const [form, setForm] = useState({
    role_name: role?.role_name || '',
    parent_role_id: role?.parent_role_id ? String(role.parent_role_id) : '',
    approval_level: role?.approval_level ?? '',
    department: !!role?.department,
    management: !!role?.management,
    finance: !!role?.finance,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/roles/${role!.id}` : '/api/v1/roles';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      role_name: form.role_name,
      parent_role_id: form.parent_role_id ? Number(form.parent_role_id) : null,
      approval_level: form.approval_level === '' ? null : Number(form.approval_level),
      department: form.department ? 1 : 0,
      management: form.management ? 1 : 0,
      finance: form.finance ? 1 : 0,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const parentOptions = roles.filter((r) => r.id !== role?.id);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">{isEdit ? 'Edit Role' : 'Create Role'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">{error}</div>)}
          <div>
            <label className="label required">Role Name</label>
            <input className="input" value={form.role_name}
              onChange={(e) => setForm({ ...form, role_name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Parent Role</label>
            <SearchableSelect
              value={form.parent_role_id}
              onChange={(v) => setForm({ ...form, parent_role_id: v })}
              options={parentOptions.map((r) => ({
                value: String(r.id),
                label: r.role_name,
              }))}
              emptyLabel="— None —"
              placeholder="Select parent role..."
            />
          </div>
          <div>
            <label className="label">Approval Level</label>
            <input type="number" className="input" value={form.approval_level}
              onChange={(e) => setForm({ ...form, approval_level: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Toggle
              checked={form.department}
              onChange={(v) => setForm({ ...form, department: v })}
              label="Department"
            />
            <Toggle
              checked={form.management}
              onChange={(v) => setForm({ ...form, management: v })}
              label="Management"
            />
            <Toggle
              checked={form.finance}
              onChange={(v) => setForm({ ...form, finance: v })}
              label="Finance"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

