'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import Toggle from '@/components/ui/Toggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Role } from '@/types';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/roles');
      const json = await res.json();
      if (json.success) setRoles(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.role_name?.toLowerCase().includes(q) ||
        r.parent_role_name?.toLowerCase().includes(q),
    );
  }, [roles, search]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
    totalPages,
    startIndex,
    paged,
    mounted,
    resetPage,
  } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this role?')) return;
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Roles</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Role
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search role, parent..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Role Name</th>
                <th>Parent</th>
                <th>Approval Level</th>
                <th>Department</th>
                <th>Management</th>
                <th>Finance</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">No roles found</td></tr>)}
              {!loading && paged.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{r.role_name}</td>
                  <td>{r.parent_role_name || '-'}</td>
                  <td>{r.approval_level ?? '-'}</td>
                  <td><Flag on={!!r.department} /></td>
                  <td><Flag on={!!r.management} /></td>
                  <td><Flag on={!!r.finance} /></td>
                  <td className="text-right">
                    <button onClick={() => setEditing(r)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          totalRows={totalRows}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {showCreate && (
        <RoleFormModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <RoleFormModal
          roles={roles}
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </DashboardShell>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
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

    const url = isEdit ? `/api/roles/${role!.id}` : '/api/roles';
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
      if (!res.ok || !json.success) {
        setError(json.message || 'Save failed');
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Role' : 'Create Role'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Role Name *</label>
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
