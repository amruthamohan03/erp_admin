'use client';

// §4.7 — Mapping → Role Payment Stage Mapping: WHO may approve or reject at
// each stage of the Payment Request chain, optionally for one location only.
//
// Pick a scope — All Locations, or one office — then tick roles against the
// active stages (Masters → Payment Stages). A role ticked under All Locations
// acts everywhere; a role ticked under one office acts on that office's requests
// only (main's location-bound approvers). Holding any grant also lets a role SEE
// the requests of the locations it approves for.
//
// An editable matrix (§4.9): the whole scope is edited in `rows` and saved in
// one PUT, whatever the search or page is showing; a column's header toggle
// scopes to the FILTERED roles, so the search box can scope a bulk change.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Save, Search } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { StageDef } from '@/lib/payments/stageConfig';
import type { PaymentStage } from '@/db/schema';

interface MatrixResponse {
  location_id: number | null;
  stages: StageDef[];
  roles: Array<{ id: number; role_name: string }>;
  grants: Array<{ role_id: number; stage: string }>;
}

interface RoleRow {
  id: number;
  role_name: string;
  granted: Set<PaymentStage>;
}

export default function RoleToPaymentStagePage() {
  const [locations, setLocations] = useState<Array<{ value: string; label: string }>>([]);
  const [scope, setScope] = useState('');
  const [stages, setStages] = useState<StageDef[]>([]);
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    void fetchMasterOptions('main-offices', 'main_location_name').then((o) =>
      setLocations(o.map((r) => ({ value: String(r.id), label: r.label }))),
    );
  }, []);

  const load = useCallback(async (loc: string) => {
    setLoading(true);
    setError(null);
    const res = await safeFetchJson<MatrixResponse>(
      `/api/v1/payment-stage-roles${loc ? `?location_id=${encodeURIComponent(loc)}` : ''}`,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      setRows([]);
      return;
    }
    const byRole = new Map<number, Set<PaymentStage>>();
    for (const g of res.data.grants) {
      if (!byRole.has(g.role_id)) byRole.set(g.role_id, new Set());
      byRole.get(g.role_id)!.add(g.stage as PaymentStage);
    }
    setStages(res.data.stages);
    setRows(res.data.roles.map((r) => ({ ...r, granted: byRole.get(r.id) ?? new Set() })));
    setDirty(false);
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  function toggle(roleId: number, stage: PaymentStage, on: boolean): void {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== roleId) return r;
        const granted = new Set(r.granted);
        if (on) granted.add(stage);
        else granted.delete(stage);
        return { ...r, granted };
      }),
    );
    setDirty(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.role_name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } =
    usePagedList(filtered);

  function toggleColumn(stage: PaymentStage, on: boolean): void {
    const target = new Set(filtered.map((r) => r.id));
    setRows((prev) =>
      prev.map((r) => {
        if (!target.has(r.id)) return r;
        const granted = new Set(r.granted);
        if (on) granted.add(stage);
        else granted.delete(stage);
        return { ...r, granted };
      }),
    );
    setDirty(true);
  }

  const scopeName = scope ? (locations.find((l) => l.value === scope)?.label ?? 'this location') : 'All Locations';
  const grantCount = rows.reduce((n, r) => n + r.granted.size, 0);

  async function save(): Promise<void> {
    setSaving(true);
    const res = await safeFetchJson<{ granted: number }>('/api/v1/payment-stage-roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: scope ? Number(scope) : null,
        grants: rows.flatMap((r) => [...r.granted].map((stage) => ({ role_id: r.id, stage }))),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message });
      return;
    }
    setDirty(false);
    setResult({
      status: 'success',
      title: 'Saved',
      message: `${scopeName}: ${res.data.granted} approval grant${res.data.granted === 1 ? '' : 's'} saved.`,
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <GitBranch className="h-6 w-6 text-primary-600" /> Role &rarr; Payment Stages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which roles may approve or reject at each stage of a Payment Request — everywhere, or at one location.
          </p>
        </div>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || loading} className="btn-primary">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="card mb-6 p-4">
        <label className="label">Location</label>
        <div className="max-w-md">
          <SearchableSelect
            value={scope}
            onChange={(v) => {
              if (dirty && !confirm('Discard the unsaved changes for this location?')) return;
              setScope(v);
            }}
            options={locations}
            emptyLabel="All Locations"
            placeholder="All Locations"
            aria-label="Location"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {scope
            ? `Grants here apply only to requests raised at ${scopeName}, in addition to any under All Locations.`
            : 'Grants here apply to requests at every location.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="card">
        <div className="border-b border-border p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search role name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {grantCount} grant{grantCount === 1 ? '' : 's'} in {scopeName}. Stages come from Masters → Payment Stages.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Role</th>
                {stages.map((s) => {
                  const allOn = filtered.length > 0 && filtered.every((r) => r.granted.has(s.stage));
                  return (
                    <th key={s.stage} className="w-28 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>{s.label}</span>
                        {s.payment_type && <span className="text-[10px] font-normal text-muted-foreground">{s.payment_type} only</span>}
                        <Toggle
                          size="sm"
                          checked={allOn}
                          onChange={(on) => toggleColumn(s.stage, on)}
                          disabled={filtered.length === 0 || loading}
                          aria-label={`${s.label} for ${search ? 'matching' : 'all'} roles`}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={stages.length + 2} className="py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={stages.length + 2} className="py-8 text-center text-muted-foreground">
                    {rows.length === 0 ? 'No roles yet — create them under Masters → Roles first.' : `No role matches “${search}”.`}
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <td className="font-medium text-muted-foreground">{startIndex + idx + 1}</td>
                    <td className="font-medium">{r.role_name}</td>
                    {stages.map((s) => (
                      <td key={s.stage} className="text-center">
                        <Toggle
                          size="sm"
                          checked={r.granted.has(s.stage)}
                          onChange={(on) => toggle(r.id, s.stage, on)}
                          aria-label={`${r.role_name} may act on ${s.label}`}
                        />
                      </td>
                    ))}
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

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
