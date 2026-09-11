'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Search, Wallet } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Role } from '@/types';

// §4.1 — Role → Expense Type. Which expense types a role may file a Payment
// Request against. The expense type decides which MCA references are claimable
// (a reference maps ONE-TO-ONE to an expense type), so this screen is where
// "who may spend against what" is decided, not a list in a route handler.

interface MappingRow {
  expense_type_id: number;
  expense_type_name: string;
  is_import: boolean;
  is_export: boolean;
  is_local: boolean;
  is_advance: boolean;
  is_other: boolean;
  is_allowed: boolean;
}

interface MappingResponse {
  role_id: number;
  unrestricted: boolean;
  expense_types: MappingRow[];
}

/** The five context flags, rendered as chips so a row is scannable. */
const SCOPES: ReadonlyArray<{ key: keyof MappingRow; label: string }> = [
  { key: 'is_import', label: 'Import' },
  { key: 'is_export', label: 'Export' },
  { key: 'is_local', label: 'Local' },
  { key: 'is_advance', label: 'Advance' },
  { key: 'is_other', label: 'Other' },
];

export default function RoleToExpenseTypePage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<string>('');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  // Load roles once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRoles(true);
    safeFetchJson<Role[]>('/api/v1/roles')
      .then((res) => {
        if (res.ok) setRoles(res.data);
        else setError(res.message);
      })
      .finally(() => setLoadingRoles(false));
  }, []);

  const loadMapping = useCallback(async (rid: number) => {
    setLoadingRows(true);
    setError(null);
    const res = await safeFetchJson<MappingResponse>(
      `/api/v1/role-expense-type-mapping?role_id=${rid}`,
    );
    setLoadingRows(false);
    if (!res.ok) {
      setError(res.message);
      setRows([]);
      return;
    }
    setRows(res.data.expense_types);
    setDirty(false);
  }, []);

  // Refetch the mapping whenever the chosen role changes.
  useEffect(() => {
    if (!roleId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      setDirty(false);
      return;
    }
    void loadMapping(Number(roleId));
  }, [roleId, loadMapping]);

  function toggleAllowed(id: number, on: boolean): void {
    setRows((prev) => prev.map((r) => (r.expense_type_id === id ? { ...r, is_allowed: on } : r)));
    setDirty(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.expense_type_name.toLowerCase().includes(q));
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

  // §4.9 — a select-all scopes to the FILTERED set, so the search box can scope
  // a bulk toggle. §4.11 — a switch has no indeterminate state, so the header
  // means all / not-all and the count is shown separately.
  const allOn = filtered.length > 0 && filtered.every((r) => r.is_allowed);
  const allowedCount = rows.filter((r) => r.is_allowed).length;

  function toggleColumn(on: boolean): void {
    const target = new Set(filtered.map((r) => r.expense_type_id));
    setRows((prev) => prev.map((r) => (target.has(r.expense_type_id) ? { ...r, is_allowed: on } : r)));
    setDirty(true);
  }

  async function handleSave(): Promise<void> {
    if (!roleId) return;
    setSaving(true);
    setError(null);
    const res = await safeFetchJson<{ role_id: number; allowed: number; cleared: number }>(
      '/api/v1/role-expense-type-mapping',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: Number(roleId),
          mappings: rows.map((r) => ({
            expense_type_id: r.expense_type_id,
            is_allowed: r.is_allowed,
          })),
        }),
      },
    );
    setSaving(false);

    // §4.22 — the outcome names the role and what happened to it.
    const roleName = roles.find((r) => String(r.id) === roleId)?.role_name ?? 'this role';
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message });
      return;
    }
    setDirty(false);
    setResult({
      status: 'success',
      title: 'Saved',
      message:
        res.data.allowed === 0
          ? `${roleName} has no expense-type restriction — every expense type stays available to it.`
          : `${roleName} may now file against ${res.data.allowed} expense type${res.data.allowed === 1 ? '' : 's'}.`,
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Wallet className="h-6 w-6 text-primary-600" />
            Role &rarr; Expense Types
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which expense types each role may file a Payment Request against.
          </p>
        </div>
        <button onClick={() => void handleSave()} disabled={!roleId || !dirty || saving || loadingRows} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="card mb-6 p-4">
        <label className="label">Role</label>
        <div className="max-w-md">
          <SearchableSelect
            value={roleId}
            onChange={(v) => setRoleId(v)}
            options={roles.map((r) => ({ value: String(r.id), label: r.role_name }))}
            placeholder={loadingRoles ? 'Loading roles…' : 'Select a role to manage…'}
            emptyLabel="— Select a role —"
            aria-label="Role"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {roleId && (
        <div className="card">
          <div className="border-b border-border p-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input pl-9"
                placeholder="Search expense type name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {allowedCount === 0
                ? 'No expense type is ticked, so this role is unrestricted — every expense type stays available to it. Tick some to restrict it to those.'
                : `${allowedCount} of ${rows.length} expense types allowed for this role.`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th className="w-[45%]">Expense Type</th>
                  <th>Applies to</th>
                  <th className="w-24 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>Allowed</span>
                      <Toggle
                        size="sm"
                        checked={allOn}
                        onChange={toggleColumn}
                        disabled={filtered.length === 0 || loadingRows}
                        aria-label={`Allow ${search ? 'matching' : 'all'} expense types`}
                        title={`Toggle ${search ? 'matching' : 'all'} expense types`}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loadingRows && paged.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      {rows.length === 0
                        ? 'No expense types yet — create them under Masters → Expense Types first.'
                        : `Nothing matches “${search}”.`}
                    </td>
                  </tr>
                )}
                {!loadingRows &&
                  paged.map((r, idx) => (
                    <tr key={r.expense_type_id} className="hover:bg-muted/50">
                      <td className="font-medium text-muted-foreground">{startIndex + idx + 1}</td>
                      <td className="max-w-0 truncate font-medium" title={r.expense_type_name}>
                        {r.expense_type_name}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {SCOPES.filter((s) => r[s.key]).map((s) => (
                            <span
                              key={s.label}
                              className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {s.label}
                            </span>
                          ))}
                          {SCOPES.every((s) => !r[s.key]) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        <Toggle
                          size="sm"
                          checked={r.is_allowed}
                          onChange={(on) => toggleAllowed(r.expense_type_id, on)}
                          aria-label={`Allowed: ${r.expense_type_name}`}
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

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
