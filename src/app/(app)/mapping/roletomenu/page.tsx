'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Search, ShieldCheck } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Role } from '@/types';

type PermKey = 'can_view' | 'can_add' | 'can_edit' | 'can_delete' | 'can_approve';

const PERM_COLUMNS: { key: PermKey; label: string }[] = [
  { key: 'can_view', label: 'View' },
  { key: 'can_add', label: 'Add' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_approve', label: 'Approve' },
];

interface MappingRow {
  menu_id: number;
  menu_parent_id: number | null;
  menu_name: string;
  menu_level: number | null;
  menu_order: number;
  url: string | null;
  icon: string | null;
  parent_name: string | null;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export default function RoleToMenuPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<string>('');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load roles once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRoles(true);
    fetch('/api/v1/roles')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setRoles(j.data);
      })
      .catch(() => setError('Failed to load roles'))
      .finally(() => setLoadingRoles(false));
  }, []);

  // Load mapping rows whenever the role changes.
  const loadMapping = useCallback(async (rid: number) => {
    setLoadingRows(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/role-menu-mapping?role_id=${rid}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Failed to load mapping');
        setRows([]);
        return;
      }
      setRows(json.data.menus);
      setDirty(false);
    } catch {
      setError('Network error');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  // Refetch the mapping whenever the chosen role changes.
  useEffect(() => {
    if (!roleId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      setDirty(false);
      return;
    }
    loadMapping(Number(roleId));
  }, [roleId, loadMapping]);

  function togglePerm(menuId: number, key: PermKey) {
    setRows((prev) =>
      prev.map((r) =>
        r.menu_id === menuId ? { ...r, [key]: !r[key] } : r,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  function toggleRow(menuId: number, on: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.menu_id === menuId
          ? {
              ...r,
              can_view: on,
              can_add: on,
              can_edit: on,
              can_delete: on,
              can_approve: on,
            }
          : r,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  function toggleColumn(key: PermKey, on: boolean) {
    // Scope to the currently filtered menus (see comment on `columnAllOn`).
    const targetIds = new Set(filtered.map((r) => r.menu_id));
    setRows((prev) =>
      prev.map((r) => (targetIds.has(r.menu_id) ? { ...r, [key]: on } : r)),
    );
    setDirty(true);
    setNotice(null);
  }

  // Pagination + search operate on the displayed slice only. The full `rows`
  // array still backs the save payload, so toggling permissions on page 2 and
  // saving on page 1 still persists everything.
  // (React Compiler memoizes this automatically — explicit useMemo blocks its
  // analysis here.)
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? rows
    : rows.filter(
        (r) =>
          r.menu_name?.toLowerCase().includes(q) ||
          r.url?.toLowerCase().includes(q) ||
          r.parent_name?.toLowerCase().includes(q),
      );

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

  // Column "select all" applies to the filtered set so the user can scope it
  // with the search box — clicking "View ✓" while filtered toggles every match.
  const columnAllOn: Record<PermKey, boolean> = {
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
    can_approve: false,
  };
  if (filtered.length > 0) {
    for (const c of PERM_COLUMNS) {
      columnAllOn[c.key] = filtered.every((r) => r[c.key]);
    }
  }

  async function handleSave() {
    if (!roleId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        role_id: Number(roleId),
        mappings: rows.map((r) => ({
          menu_id: r.menu_id,
          can_view: r.can_view,
          can_add: r.can_add,
          can_edit: r.can_edit,
          can_delete: r.can_delete,
          can_approve: r.can_approve,
        })),
      };
      const res = await fetch('/api/v1/role-menu-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      setDirty(false);
      setNotice(
        `Saved — ${json.data.saved} granted, ${json.data.removed} cleared.`,
      );
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            Role &rarr; Menu Mapping
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Grant view / add / edit / delete / approve permissions per role.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!roleId || !dirty || saving || loadingRows}
          className="btn-primary"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="card p-4 mb-6">
        <label className="label">Role</label>
        <div className="max-w-md">
          <SearchableSelect
            value={roleId}
            onChange={(v) => setRoleId(v)}
            options={roles.map((r) => ({
              value: String(r.id),
              label: r.role_name,
            }))}
            placeholder={
              loadingRoles ? 'Loading roles…' : 'Select a role to manage…'
            }
            emptyLabel="— Select a role —"
          />
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

      {roleId && (
        <div className="card">
          <div className="p-4 border-b border-slate-200">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="input pl-9"
                placeholder="Search menu, url, parent..."
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
                  <th className="w-[35%]">Menu</th>
                  {PERM_COLUMNS.map((c) => (
                    <th key={c.key} className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>{c.label}</span>
                        <Toggle
                          size="sm"
                          checked={columnAllOn[c.key]}
                          onChange={(v) => toggleColumn(c.key, v)}
                          disabled={filtered.length === 0 || loadingRows}
                          aria-label={`${c.label} for ${
                            search ? 'matching' : 'all'
                          } menus`}
                          title={`Toggle ${c.label} for ${
                            search ? 'matching' : 'all'
                          } menus`}
                        />
                      </div>
                    </th>
                  ))}
                  <th className="text-center w-[80px]">All</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td
                      colSpan={PERM_COLUMNS.length + 3}
                      className="text-center text-muted-foreground py-8"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loadingRows && paged.length === 0 && (
                  <tr>
                    <td
                      colSpan={PERM_COLUMNS.length + 3}
                      className="text-center text-muted-foreground py-8"
                    >
                      No menus to map.
                    </td>
                  </tr>
                )}
                {!loadingRows &&
                  paged.map((r, idx) => {
                    const isChild = (r.menu_level ?? 0) > 0;
                    const allOn =
                      r.can_view &&
                      r.can_add &&
                      r.can_edit &&
                      r.can_delete &&
                      r.can_approve;
                    return (
                      <tr key={r.menu_id} className="hover:bg-slate-50">
                        <td className="text-muted-foreground font-medium">
                          {startIndex + idx + 1}
                        </td>
                        <td className={isChild ? 'pl-10' : 'font-medium'}>
                          {isChild && (
                            <span className="text-muted-foreground mr-2">└</span>
                          )}
                          {r.menu_name}
                          {r.url && r.url !== '#' && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.url}
                            </span>
                          )}
                        </td>
                        {PERM_COLUMNS.map((c) => (
                          <td key={c.key} className="text-center">
                            <Toggle
                              size="sm"
                              checked={r[c.key]}
                              onChange={() => togglePerm(r.menu_id, c.key)}
                              aria-label={`${c.label} for ${r.menu_name}`}
                            />
                          </td>
                        ))}
                        <td className="text-center">
                          <Toggle
                            size="sm"
                            checked={allOn}
                            onChange={(v) => toggleRow(r.menu_id, v)}
                            aria-label={`All permissions for ${r.menu_name}`}
                            title="Toggle all permissions for this menu"
                          />
                        </td>
                      </tr>
                    );
                  })}
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
      )}
    </>
  );
}

