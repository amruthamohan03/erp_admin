'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldX, Trash2 } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { safeFetchJson } from '@/lib/safeFetch';

// §4.27 — the Recycle Bin. Normal deletion only sets display = 'N', so this is
// where those records live: still readable to history, restorable, and
// destroyable only by someone holding the separate permanent-delete grant.
//
// Only resources the current role can restore or permanently delete are listed;
// a role that can do neither sees nothing (§4.14).

interface ResourceRow {
  key: string;
  label: string;
  menu: string;
  count: number;
  can_restore: boolean;
  can_permanent_delete: boolean;
}

interface DeletedRow {
  id: number;
  label: string;
}

export default function RecycleBinPage() {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [active, setActive] = useState<string>('');
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [result, setResult] = useState<SaveResult | null>(null);
  // Permanent delete asks twice: this holds the row awaiting the typed
  // confirmation (§4.27).
  const [confirmRow, setConfirmRow] = useState<DeletedRow | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const loadIndex = useCallback(async () => {
    setLoadingIndex(true);
    const res = await safeFetchJson<ResourceRow[]>('/api/v1/recycle-bin');
    if (res.ok) {
      setResources(res.data);
      setActive((prev) => prev || res.data.find((r) => r.count > 0)?.key || res.data[0]?.key || '');
    }
    setLoadingIndex(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadIndex(); }, [loadIndex]);

  const loadRows = useCallback(async () => {
    if (!active) { setRows([]); setTotal(0); return; }
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) params.set('q', search.trim());
    const res = await safeFetchJson<DeletedRow[]>(`/api/v1/recycle-bin/${active}?${params}`);
    if (res.ok) {
      setRows(res.data);
      // The filtered count comes from the envelope's meta, not from the index —
      // the index count is unfiltered, so using it while searching would page
      // past the end of the result set.
      setTotal(typeof res.meta?.total === 'number' ? res.meta.total : res.data.length);
    } else {
      setRows([]);
      setResult({ status: 'error', title: 'Could not load', message: res.message, detail: res.detail });
    }
    setLoading(false);
  }, [active, page, pageSize, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadRows(); }, [loadRows]);

  const current = useMemo(() => resources.find((r) => r.key === active) ?? null, [resources, active]);

  async function restore(row: DeletedRow) {
    setBusy(true);
    const res = await safeFetchJson<DeletedRow>(`/api/v1/recycle-bin/${active}/${row.id}/restore`, {
      method: 'POST',
    });
    setBusy(false);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not restored', message: res.message, detail: res.detail });
      return;
    }
    setResult({
      status: 'success',
      title: 'Restored',
      message: `"${row.label}" is active again and back in its list.`,
    });
    loadRows();
    loadIndex();
  }

  async function permanentlyDelete() {
    if (!confirmRow) return;
    setBusy(true);
    const res = await safeFetchJson<DeletedRow>(`/api/v1/recycle-bin/${active}/${confirmRow.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: typed }),
    });
    setBusy(false);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not removed', message: res.message, detail: res.detail });
      return;
    }
    const label = confirmRow.label;
    setConfirmRow(null);
    setTyped('');
    setResult({
      status: 'success',
      title: 'Permanently deleted',
      message: `"${label}" has been removed for good. This cannot be undone.`,
    });
    loadRows();
    loadIndex();
  }

  const totalDeleted = resources.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trash2 className="h-6 w-6 text-primary-600" />
          Recycle Bin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting a record only hides it. Everything hidden is here — restore it, or remove it for
          good if you hold that permission.
        </p>
      </div>

      {!loadingIndex && resources.length === 0 && (
        <div className="card p-6 text-sm text-muted-foreground">
          You do not have permission to restore or permanently delete any records. Ask an
          administrator for the <strong>Restore</strong> grant on the modules you need.
        </div>
      )}

      {resources.length > 0 && (
        <>
          <div className="card mb-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem]">
                <label className="label" htmlFor="recycle-resource">
                  Records from
                </label>
                <SearchableSelect
                  id="recycle-resource"
                  value={active}
                  onChange={(v) => { setActive(v); setPage(1); setSearch(''); }}
                  options={resources.map((r) => ({
                    value: r.key,
                    label: `${r.label} (${r.count})`,
                  }))}
                  placeholder="Choose a record type"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {totalDeleted === 0
                  ? 'Nothing has been deleted yet.'
                  : `${totalDeleted} deleted record${totalDeleted === 1 ? '' : 's'} across ${resources.length} types.`}
              </p>
            </div>
          </div>

          <DataTable<DeletedRow>
            rows={rows}
            loading={loading}
            rowKey={(r) => r.id}
            title={current ? `Deleted ${current.label}` : 'Deleted records'}
            searchPlaceholder="Search deleted records..."
            emptyMessage={
              current
                ? `No deleted ${current.label.toLowerCase()} — nothing to restore here.`
                : 'Choose a record type above.'
            }
            columns={[{ key: 'label', header: 'Record', className: 'font-medium' }]}
            actions={(row) => ({
              restore: current?.can_restore ? () => restore(row) : undefined,
              extra: current?.can_permanent_delete ? (
                <button
                  type="button"
                  onClick={() => { setConfirmRow(row); setTyped(''); }}
                  title="Permanently delete"
                  className="ico ms-1 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <ShieldX className="h-4 w-4" />
                </button>
              ) : null,
            })}
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
        </>
      )}

      {/* §4.27 — the second ask. The name has to be typed, so this cannot be
          completed by muscle memory on a confirm dialog. */}
      {confirmRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-md overflow-hidden">
            <div className="flex items-start gap-3 p-5">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                <ShieldX className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground">Permanently delete this record?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes <strong className="text-foreground">{confirmRow.label}</strong> from
                  the database for good. Reports and audit history that name it will no longer be
                  able to resolve it. There is no undo.
                </p>
                <label className="label mt-3" htmlFor="confirm-name">
                  Type <strong className="text-foreground">{confirmRow.label}</strong> to confirm
                </label>
                <input
                  id="confirm-name"
                  autoFocus
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmRow.label}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => { setConfirmRow(null); setTyped(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={permanentlyDelete}
                disabled={busy || typed.trim() !== confirmRow.label.trim()}
                className="btn-permanent-delete"
              >
                <ShieldX className="h-4 w-4" />
                {busy ? 'Removing…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
