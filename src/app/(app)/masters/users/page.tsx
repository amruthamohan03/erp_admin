'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, Plus, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable from '@/components/ui/DataTable';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { fetchMasterOptions, type SelectOption } from '@/lib/selectOptions';
import type { User, Role } from '@/types';

/**
 * Which accounts the list is showing. `display` is both the §4.27 soft-delete
 * flag and the account's enable/disable switch — `login` refuses anyone whose
 * display is not 'Y' — so a disabled user has to be reachable here, or the only
 * screen that can re-enable them is the one screen that hides them.
 */
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: 'Enabled' },
  { value: 'inactive', label: 'Disabled' },
  { value: 'all', label: 'All' },
];

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
  const [status, setStatus] = useState('active');
  const [locationFilter, setLocationFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  /** Ids currently mid-flight on the enable/disable toggle. */
  const [busy, setBusy] = useState<Set<number>>(new Set());
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  // Hydration guard for the pagination footer (matches the convention in
  // src/components/ui/PaginationFooter.tsx).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        status,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (locationFilter) params.set('location_id', locationFilter);
      if (deptFilter) params.set('dept_id', deptFilter);
      const res = await fetch(`/api/v1/users?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, locationFilter, deptFilter]);

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

  // The two master-backed pickers, through the shared fetcher (§4.16, §4.10).
  useEffect(() => {
    let live = true;
    void (async () => {
      const [offices, depts] = await Promise.all([
        fetchMasterOptions('main-offices', 'main_location_name'),
        fetchMasterOptions('departments', 'department_name'),
      ]);
      if (!live) return;
      setLocations(offices.map((o) => ({ value: String(o.id), label: o.label })));
      setDepartments(depts.map((o) => ({ value: String(o.id), label: o.label })));
    })();
    return () => {
      live = false;
    };
  }, []);

  /**
   * Enable or disable an account.
   *
   * Disabling is not cosmetic — `login` refuses a user whose display is not
   * 'Y' — so the outcome names what it did to whom (§4.22) rather than saying
   * "Saved". The row is patched in place instead of reloading the whole page,
   * except when the current filter would no longer include it.
   */
  async function setEnabled(u: User, enabled: boolean) {
    setBusy((prev) => new Set(prev).add(u.id));
    try {
      const res = await fetch(`/api/v1/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display: enabled ? 'Y' : 'N' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResult({
          status: 'error',
          title: enabled ? 'Not enabled' : 'Not disabled',
          message: json.error?.message || `${u.username} could not be updated.`,
        });
        return;
      }
      setResult({
        status: 'success',
        title: enabled ? 'Enabled' : 'Disabled',
        message: enabled
          ? `${u.username} can sign in again.`
          : `${u.username} can no longer sign in. Their records and history are untouched.`,
      });
      // A row that no longer matches the status filter has to leave the list,
      // so reload rather than leaving a stale row behind.
      if (status === 'all') {
        setItems((prev) =>
          prev.map((r) => (r.id === u.id ? { ...r, display: enabled ? 'Y' : 'N' } : r)),
        );
      } else {
        load();
      }
    } catch {
      setResult({ status: 'error', title: 'Not updated', message: 'Network error.' });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
    }
  }

  const exportHref = (() => {
    const p = new URLSearchParams({ status });
    if (search) p.set('q', search);
    if (locationFilter) p.set('location_id', locationFilter);
    if (deptFilter) p.set('dept_id', deptFilter);
    return `/api/v1/users/export?${p}`;
  })();

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
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
      </div>

      <DataTable<User>
        rows={items}
        loading={loading}
        rowKey={(u) => u.id}
        searchPlaceholder="Search username, name, email, location, department..."
        emptyMessage={
          status === 'inactive'
            ? 'No disabled accounts — everyone can sign in.'
            : 'No users yet — create the first one.'
        }
        filters={
          <>
            <SearchableSelect
              size="sm"
              className="w-32"
              aria-label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                setStatus(v || 'active');
                setPage(1);
              }}
            />
            <SearchableSelect
              size="sm"
              className="w-40"
              aria-label="Location"
              value={locationFilter}
              options={locations}
              emptyLabel="All Locations"
              placeholder="All Locations"
              onChange={(v) => {
                setLocationFilter(v);
                setPage(1);
              }}
            />
            <SearchableSelect
              size="sm"
              className="w-40"
              aria-label="Department"
              value={deptFilter}
              options={departments}
              emptyLabel="All Departments"
              placeholder="All Departments"
              onChange={(v) => {
                setDeptFilter(v);
                setPage(1);
              }}
            />
          </>
        }
        toolbar={
          <>
            {/* §4.20 — an export produces a spreadsheet, so it is `btn-excel`.
                It carries the list's own filter, so the file matches the screen. */}
            <a href={exportHref} className="btn-excel btn-sm">
              <Download className="h-4 w-4" /> Export
            </a>
            {/* §4.35 — the create action belongs to the list it adds to, last. */}
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
              <Plus className="h-4 w-4" /> New User
            </button>
          </>
        }
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
        {
          key: 'location_name',
          header: 'Location',
          sortable: true,
          render: (u: User) => u.location_name || <span className="text-muted-foreground">—</span>,
        },
        {
          key: 'department_name',
          header: 'Department',
          sortable: true,
          render: (u: User) => u.department_name || <span className="text-muted-foreground">—</span>,
        },
        {
          key: 'display',
          header: 'Enabled',
          align: 'center',
          // §4.11 — a boolean setting is a Toggle, never a checkbox, and inside
          // a table cell it needs its own aria-label: the column header alone
          // does not name which row's switch this is.
          className: 'w-20',
          render: (u: User) => (
            <Toggle
              size="sm"
              checked={u.display === 'Y'}
              disabled={busy.has(u.id)}
              aria-label={`${u.display === 'Y' ? 'Disable' : 'Enable'} ${u.username}`}
              title={u.display === 'Y' ? 'Enabled — can sign in' : 'Disabled — cannot sign in'}
              onChange={(v) => void setEnabled(u, v)}
            />
          ),
        },
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
          locations={locations}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); setResult({ status: 'success', title: 'Created', message: 'The user has been created.' }); }}
        />
      )}

      {editing && (
        <UserFormModal
          roles={roles}
          locations={locations}
          departments={departments}
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
  locations,
  departments,
  onClose,
  onSaved,
}: {
  user?: User;
  roles: Role[];
  locations: SelectOption[];
  departments: SelectOption[];
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
    // Strings: a `<SearchableSelect>` value is always a string, and a number
    // silently never matches an option (§4.16).
    location_id: user?.location_id != null ? String(user.location_id) : '',
    dept_id: user?.dept_id != null ? String(user.dept_id) : '',
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
      location_id: form.location_id ? Number(form.location_id) : null,
      dept_id: form.dept_id ? Number(form.dept_id) : null,
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
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">{error}</div>
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
          {/* §4.1 / §4.16 — master-backed pickers, not typed ids. A number an
              operator types names nothing and joins to nothing. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Location</label>
              <SearchableSelect
                aria-label="Location"
                value={form.location_id}
                onChange={(v) => setForm({ ...form, location_id: v })}
                options={locations}
                emptyLabel="— None —"
                placeholder="Select location..."
              />
            </div>
            <div>
              <label className="label">Department</label>
              <SearchableSelect
                aria-label="Department"
                value={form.dept_id}
                onChange={(v) => setForm({ ...form, dept_id: v })}
                options={departments}
                emptyLabel="— None —"
                placeholder="Select department..."
              />
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

