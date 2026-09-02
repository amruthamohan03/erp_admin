'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Save, Search } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Role } from '@/types';

interface MappingRow {
  card_id: number;
  card_key: string;
  card_title: string;
  card_subtitle: string | null;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
  default_order: number;
  is_visible: boolean;
  role_order: number;
}

export default function RoleToDashboardCardPage() {
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

  const loadMapping = useCallback(async (rid: number) => {
    setLoadingRows(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/v1/role-dashboard-card-mapping?role_id=${rid}`,
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Failed to load mapping');
        setRows([]);
        return;
      }
      setRows(json.data.cards);
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

  function toggleVisible(cardId: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.card_id === cardId ? { ...r, is_visible: !r.is_visible } : r,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  function updateOrder(cardId: number, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.card_id === cardId
          ? { ...r, role_order: Math.max(0, Math.floor(value || 0)) }
          : r,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.card_title?.toLowerCase().includes(q) ||
        r.card_key?.toLowerCase().includes(q) ||
        r.card_subtitle?.toLowerCase().includes(q) ||
        r.card_category?.toLowerCase().includes(q),
    );
  }, [rows, search]);

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

  const columnAllOn = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((r) => r.is_visible);
  }, [filtered]);

  function toggleColumn(on: boolean) {
    const targetIds = new Set(filtered.map((r) => r.card_id));
    setRows((prev) =>
      prev.map((r) =>
        targetIds.has(r.card_id) ? { ...r, is_visible: on } : r,
      ),
    );
    setDirty(true);
    setNotice(null);
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
          card_id: r.card_id,
          is_visible: r.is_visible,
          card_order: r.role_order,
        })),
      };
      const res = await fetch('/api/v1/role-dashboard-card-mapping', {
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
        `Saved — ${json.data.saved} kept, ${json.data.removed} cleared.`,
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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary-600" />
            Role &rarr; Dashboard Cards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which dashboard cards each role sees and the order they
            appear in.
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
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
          {notice}
        </div>
      )}

      {roleId && (
        <div className="card">
          <div className="p-4 border-b border-border">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="input pl-9"
                placeholder="Search card title, key, category..."
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
                  <th className="w-[35%]">Card</th>
                  <th>Category</th>
                  <th>Default order</th>
                  <th>Role order</th>
                  <th className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>Visible</span>
                      <Toggle
                        size="sm"
                        checked={columnAllOn}
                        onChange={toggleColumn}
                        disabled={filtered.length === 0 || loadingRows}
                        aria-label={`Visibility for ${
                          search ? 'matching' : 'all'
                        } cards`}
                        title={`Toggle visibility for ${
                          search ? 'matching' : 'all'
                        } cards`}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loadingRows && paged.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No cards to map.
                    </td>
                  </tr>
                )}
                {!loadingRows &&
                  paged.map((r, idx) => (
                    <tr key={r.card_id} className="hover:bg-muted/50">
                      <td className="text-muted-foreground font-medium">
                        {startIndex + idx + 1}
                      </td>
                      <td>
                        <div className="font-medium flex items-center gap-2">
                          {r.card_icon && <i className={`bi ${r.card_icon}`} />}
                          {r.card_title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <code>{r.card_key}</code>
                          {r.card_subtitle ? ` — ${r.card_subtitle}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {r.card_category || '—'}
                        </span>
                      </td>
                      <td className="text-muted-foreground">{r.default_order}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="input w-24"
                          value={r.role_order}
                          onChange={(e) =>
                            updateOrder(r.card_id, Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="text-center">
                        <Toggle
                          size="sm"
                          checked={r.is_visible}
                          onChange={() => toggleVisible(r.card_id)}
                          aria-label={`Visible: ${r.card_title}`}
                        />
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
      )}
    </>
  );
}

