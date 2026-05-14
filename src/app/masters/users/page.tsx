'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { User, Role } from '@/types';

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((j) => j.success && setRoles(j.data))
      .catch(() => {});
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Disable this user?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New User
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search username, name, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Mobile</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={7} className="text-center text-slate-500 py-8">No users found</td></tr>)}
              {!loading && items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td>{u.id}</td>
                  <td className="font-medium">{u.username}</td>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
                      {u.role_name}
                    </span>
                  </td>
                  <td>{u.mobile || '-'}</td>
                  <td className="text-right">
                    <button onClick={() => setEditing(u)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-slate-200 text-sm">
          <div className="text-slate-500">Showing {items.length} of {total}</div>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="px-3 py-2">{page} / {totalPages}</span>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {showCreate && (
        <UserFormModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <UserFormModal
          roles={roles}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </DashboardShell>
  );
}

function UserFormModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user?: User;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    email: user?.email || '',
    full_name: user?.full_name || '',
    mobile: user?.mobile || '',
    role_id: user?.role_id || roles[0]?.id || 1,
    location_id: user?.location_id || '',
    dept_id: user?.dept_id || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/users/${user!.id}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';

    const payload: Record<string, unknown> = {
      email: form.email,
      full_name: form.full_name,
      mobile: form.mobile || null,
      role_id: Number(form.role_id),
      location_id: form.location_id || null,
      dept_id: form.dept_id || null,
    };

    if (!isEdit) {
      payload.username = form.username;
      payload.password = form.password;
    } else if (form.password) {
      payload.password = form.password;
    }

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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Username *</label>
              <input className="input" value={form.username} disabled={isEdit}
                onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div>
              <label className="label">Password {isEdit ? '(leave empty to keep)' : '*'}</label>
              <input type="password" className="input" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required={!isEdit} />
            </div>
          </div>
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input" value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Role *</label>
            <SearchableSelect
              value={String(form.role_id)}
              onChange={(v) => setForm({ ...form, role_id: Number(v) })}
              options={roles.map((r) => ({
                value: String(r.id),
                label: r.role_name,
              }))}
              placeholder="Select role..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Location ID</label>
              <input className="input" value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value })} />
            </div>
            <div>
              <label className="label">Department ID</label>
              <input className="input" value={form.dept_id}
                onChange={(e) => setForm({ ...form, dept_id: e.target.value })} />
            </div>
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
