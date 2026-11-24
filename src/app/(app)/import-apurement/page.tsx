'use client';

// Import License → Import Apurement (licence clearance, IB).
//
// Four cards, each a view of the list below (§4.29):
//   Pending      — opens the pending grid for one client (asks which, if no filter)
//   With AR      — transmissions the bank has acknowledged
//   Without AR   — transmissions still awaiting the bank's acknowledgement
//   Apured       — the files carried by a transmission
// The transmissions list is the default view; New Transmission sits in its toolbar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, FileCheck2, FolderOpen, Plus, Send, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchClientOptions, type ClientOption } from '@/lib/clientOptions';
import { formatDate } from '@/lib/formatDate';
import type {
  ApuredFileRow,
  ApurementClient,
  ApurementStats,
  TransmissionRow,
} from '@/db/queries/importApurement';
import { effectiveAssRef } from '@/modules/import-apurement/assRef';
import { formatMoney } from '@/lib/exchangeRates';
import NewTransmissionModal from '@/modules/import-apurement/NewTransmissionModal';
import TransmissionDetailModal from '@/modules/import-apurement/TransmissionDetailModal';

const API = '/api/v1/import-apurement';

type View = 'all' | 'with' | 'without' | 'apured';

export default function ImportApurementPage() {
  const router = useRouter();
  const [clientFilter, setClientFilter] = useState('');
  const [clientOpts, setClientOpts] = useState<ClientOption[]>([]);
  const [stats, setStats] = useState<ApurementStats | null>(null);
  const [view, setView] = useState<View>('all');

  // Transmissions (server-side).
  const [items, setItems] = useState<TransmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Apured files (client-side — one client's, or a filtered set).
  const [apured, setApured] = useState<ApuredFileRow[]>([]);
  const [apuredLoading, setApuredLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<TransmissionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickPending, setPickPending] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    fetchClientOptions().then(setClientOpts);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await safeFetchJson<ApurementStats>(`${API}/stats${clientFilter ? `?client_id=${clientFilter}` : ''}`);
    if (res.ok) setStats(res.data);
  }, [clientFilter]);

  const listParams = useMemo(() => {
    const p = new URLSearchParams();
    if (clientFilter) p.set('client_id', clientFilter);
    if (view === 'with' || view === 'without') p.set('ar', view);
    if (search.trim()) p.set('q', search.trim());
    return p;
  }, [clientFilter, view, search]);

  const loadTransmissions = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(listParams);
      p.set('page', String(page));
      p.set('pageSize', String(pageSize));
      const res = await safeFetchJson<TransmissionRow[]>(`${API}/transmissions?${p}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(typeof res.meta?.total === 'number' ? res.meta.total : 0);
      } else {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
      }
    } finally {
      setLoading(false);
    }
  }, [listParams, page, pageSize]);

  const loadApured = useCallback(async () => {
    setApuredLoading(true);
    try {
      const res = await safeFetchJson<ApuredFileRow[]>(`${API}/apured${clientFilter ? `?client_id=${clientFilter}` : ''}`);
      if (res.ok) setApured(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setApuredLoading(false);
    }
  }, [clientFilter]);

  const reloadAll = useCallback(() => {
    loadStats();
    if (view === 'apured') loadApured();
    else loadTransmissions();
  }, [loadStats, loadApured, loadTransmissions, view]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadAll();
  }, [reloadAll]);

  function openPending() {
    if (clientFilter) router.push(`/import-apurement/pending?client_id=${clientFilter}`);
    else setPickPending(true);
  }

  function selectView(next: View) {
    setView((v) => (v === next ? 'all' : next));
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await safeFetchJson(`${API}/transmissions/${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
        return;
      }
      setResult({
        status: 'success',
        title: 'Deleted',
        message: `Transmission ${deleting.transmission_reference} has been deleted, and its ${deleting.file_count} file${deleting.file_count === 1 ? ' is' : 's are'} back on the pending list.`,
      });
      reloadAll();
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Import Apurement (IB)</h1>
        <div className="w-64 min-w-0">
          <SearchableSelect
            size="sm"
            value={clientFilter}
            onChange={(v) => { setClientFilter(v); setPage(1); }}
            options={clientOpts}
            emptyLabel="All Clients"
            placeholder="All Clients"
            aria-label="Filter by client"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Files awaiting apurement"
          value={stats?.pending_files ?? '…'}
          color="violet"
          subtitle="Quitted files not yet sent to a bank"
          hint="Click to open the pending grid"
          onClick={openPending}
          title="Open the pending files grid"
        />
        <StatCard
          icon={<FileCheck2 className="h-5 w-5" />}
          label="Transmissions with AR"
          value={stats?.transmissions_with_ar ?? '…'}
          color="emerald"
          subtitle="Acknowledged by the bank"
          hint="Click to filter the list"
          onClick={() => selectView('with')}
          active={view === 'with'}
          title="Show transmissions the bank has acknowledged"
        />
        <StatCard
          icon={<Send className="h-5 w-5" />}
          label="Transmissions without AR"
          value={stats?.transmissions_without_ar ?? '…'}
          color="amber"
          subtitle="Awaiting the bank's acknowledgement"
          hint="Click to filter the list"
          onClick={() => selectView('without')}
          active={view === 'without'}
          title="Show transmissions awaiting the bank's acknowledgement"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Files apured"
          value={stats?.apured_files ?? '…'}
          color="orange"
          subtitle="Carried by a transmission"
          hint="Click to see the files"
          onClick={() => selectView('apured')}
          active={view === 'apured'}
          title="Show the files carried by a transmission"
        />
      </div>

      {view === 'apured' ? (
        <DataTable<ApuredFileRow>
          tableId="apurement-apured"
          rows={apured}
          loading={apuredLoading}
          rowKey={(f) => f.import_id}
          title="Files apured"
          searchPlaceholder="Search file ref, licence, client, transmission, declaration..."
          emptyMessage="No file has been apured yet — create a transmission from the transmissions list."
          exportHref={`${API}/apured/export${clientFilter ? `?client_id=${clientFilter}` : ''}`}
          columns={[
            { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
            { key: 'client_short', header: 'Client', sortable: true, className: 'font-medium' },
            { key: 'license_number', header: 'Licence', sortable: true, className: 'text-xs' },
            { key: 'ref_decl', header: 'Ref. Decl.', className: 'text-xs' },
            { key: 'date_decl', header: 'Date Decl.', sortable: true, className: 'text-xs', render: (f) => formatDate(f.date_decl) },
            { key: 'bank_name', header: 'Bank', className: 'text-xs' },
            { key: 'monnaie', header: 'Currency', className: 'text-xs' },
            { key: 'cif', header: 'CIF', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (f) => formatMoney(f.cif) },
            { key: 'ass_ref', header: 'ASS REF', value: (f) => effectiveAssRef(f), className: 'text-xs' },
            { key: 'clearance_type', header: 'Type', className: 'text-xs' },
            { key: 'transmission_reference', header: 'Transmission', sortable: true, className: 'font-mono text-xs' },
            { key: 'transmission_date', header: 'Transmitted', sortable: true, className: 'text-xs', render: (f) => formatDate(f.transmission_date) },
          ]}
        />
      ) : (
        <DataTable<TransmissionRow>
          tableId="apurement-transmissions"
          rows={items}
          loading={loading}
          rowKey={(t) => t.id}
          title={view === 'with' ? 'Transmissions with AR' : view === 'without' ? 'Transmissions without AR' : 'Transmissions'}
          searchPlaceholder="Search reference, client, licence, bank, date..."
          emptyMessage="No transmissions yet — create the first one from files ready on the pending grid."
          exportHref={`${API}/transmissions/export?${listParams}`}
          toolbar={
            <>
              <button type="button" onClick={openPending} className="btn-neutral btn-sm">
                <FolderOpen className="h-4 w-4" /> Pending files
              </button>
              <button type="button" onClick={() => setCreating(true)} className="btn-primary btn-sm">
                <Plus className="h-4 w-4" /> New Transmission
              </button>
            </>
          }
          columns={[
            { key: 'transmission_reference', header: 'Reference', className: 'font-mono text-xs font-medium' },
            { key: 'client_short', header: 'Client', className: 'font-medium' },
            { key: 'transmission_date', header: 'Date', className: 'text-xs', render: (t) => formatDate(t.transmission_date) },
            { key: 'date_depot', header: 'Date Depot', className: 'text-xs', render: (t) => formatDate(t.date_depot) },
            { key: 'bank_name', header: 'Bank', className: 'text-xs' },
            { key: 'license_number', header: 'Licence', className: 'text-xs' },
            { key: 'file_count', header: 'Files', align: 'center', className: 'tabular-nums' },
            {
              key: 'ar',
              header: 'AR',
              value: (t) => (t.ar_file_id ? 'Received' : 'Awaiting AR'),
              badge: (t) => (t.ar_file_id ? 'emerald' : 'amber'),
            },
          ]}
          actions={(t) => ({ view: () => setViewing(t.id), remove: () => setDeleting(t) })}
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
      )}

      {creating && (
        <NewTransmissionModal
          initialClientId={clientFilter}
          onClose={() => setCreating(false)}
          onResult={(r, created) => {
            setResult(r);
            if (created) {
              setCreating(false);
              reloadAll();
            }
          }}
        />
      )}

      {viewing !== null && (
        <TransmissionDetailModal
          transmissionId={viewing}
          onClose={() => setViewing(null)}
          onChanged={reloadAll}
          onResult={setResult}
        />
      )}

      {pickPending && (
        <PendingClientPicker
          onClose={() => setPickPending(false)}
          onPick={(id) => router.push(`/import-apurement/pending?client_id=${id}`)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete transmission"
        tone="danger"
        confirmLabel="Delete transmission"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        Delete transmission <strong>{deleting?.transmission_reference}</strong> ({deleting?.client_short})? Its{' '}
        {deleting?.file_count} file{deleting?.file_count === 1 ? '' : 's'} go back to the pending list, and its
        reference is not reused.
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

/** Which client's pending files to open — only clients that have some. */
function PendingClientPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [clients, setClients] = useState<ApurementClient[] | null>(null);
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    safeFetchJson<ApurementClient[]>(`${API}/clients?state=pending`).then((res) => setClients(res.ok ? res.data : []));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">Files awaiting apurement</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 p-4">
          <label className="label required">Client</label>
          <SearchableSelect
            value={clientId}
            onChange={setClientId}
            options={(clients ?? []).map((c) => ({ value: String(c.id), label: `${c.short_name ?? `#${c.id}`} — ${c.file_count} pending` }))}
            placeholder={clients === null ? 'Loading…' : clients.length ? 'Choose a client' : 'No client has pending files'}
            aria-label="Client"
            required
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" disabled={!clientId} onClick={() => onPick(clientId)} className="btn-primary">
            Open pending files
          </button>
        </div>
      </div>
    </div>
  );
}
