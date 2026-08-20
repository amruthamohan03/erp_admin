'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import type { User, Role } from '@/types';

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  // Hydration guard for the pagination footer (matches the convention in
  // src/components/ui/PaginationFooter.tsx).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/users?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/v1/roles')
      .then((r) => r.json())
      .then((j) => j.ok && setRoles(j.data))
      .catch(() => {});
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Disable this user?')) return;
    const res = await fetch(`/api/v1/users/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This user could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The user has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New User
        </button>
      </div>

      <DataTable<User>
        rows={items}
        loading={loading}
        rowKey={(u) => u.id}
        searchPlaceholder="Search username, name, email..."
        emptyMessage="No record yet — create the first one."
        columns={[
        { key: 'username', header: 'Username', sortable: true, className: 'font-medium' },
        { key: 'full_name', header: 'Full Name', sortable: true },
        { key: 'email', header: 'Email', sortable: true },
        { key: '5', header: 'Role', className: 'inline-block rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700', render: (u: User) => (
            <>
            <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
                      {u.role_name}
                    </span>
            </>
          ) },
        { key: 'mobile', header: 'Mobile', render: (u: User) => (
            <>
            {u.mobile || '-'}
            </>
          ) },
        ]}
        actions={(u) => ({ edit: () => setEditing(u), remove: () => handleDelete(u.id) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {showCreate && (
        <UserFormModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); setResult({ status: 'success', title: 'Created', message: 'The user has been created.' }); }}
        />
      )}

      {editing && (
        <UserFormModal
          roles={roles}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); setResult({ status: 'success', title: 'Saved', message: 'Your changes to this user have been saved.' }); }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
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

    const url = isEdit ? `/api/v1/users/${user!.id}` : '/api/v1/users';
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label required">Username</label>
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
            <label className="label required">Full Name</label>
            <input className="input" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label required">Email</label>
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
            <label className="label required">Role</label>
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

