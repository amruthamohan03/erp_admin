'use client';

// §2 step 3 — Tracking Management → File Cancellation.
//
// Choose the tracking type (Import / Export / Local), the client, the licences
// (Import and Export only — a Local file has none), then the MCA references to
// cancel, with a reason and date. Cancelling sets each file's clearing status to
// CANCELLED and writes the reason and date into its remarks, so the tracking
// screens show why it stopped. A cancelled file takes no further activity —
// it leaves the invoice and payment request pickers — and its weight / FOB
// return to its licence. See db/queries/fileCancellation.ts.
//
// A file still on a live invoice or payment request is refused, with the
// records named: remove it from them first.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, FileX2, ShieldAlert, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import MultiSelect, { type MultiSelectOption } from '@/components/ui/MultiSelect';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { fetchClientOptions, type ClientOption } from '@/lib/clientOptions';
import { formatDate, toDateInputValue } from '@/lib/formatDate';
import type { FileKind } from '@/schemas/fileCancellation';

const KIND_OPTIONS: { value: FileKind; label: string }[] = [
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
  { value: 'local', label: 'Local' },
];

interface Options {
  licensed: boolean;
  licenses: { id: number; license_number: string; files: number }[];
  files: { id: number; mca_ref: string; license_id: number | null; detail: string }[];
}

interface CancelledRow {
  key: string;
  kind_label: string;
  mca_ref: string;
  client_name: string | null;
  client_legal_name: string | null;
  license_number: string | null;
  weight: number;
  fob: number | null;
  reason: string | null;
  cancelled_date: string | null;
  cancelled_by: string | null;
}

const money = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = (): string => toDateInputValue(new Date().toISOString().slice(0, 10));

/** The pickers are answered in order; the number says so without a paragraph. */
function Step({ n, children, required = true }: { n: number; children: string; required?: boolean }) {
  return (
    <label className={`label flex items-center gap-1.5 ${required ? 'required' : ''}`}>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">
        {n}
      </span>
      {children}
    </label>
  );
}

export default function FileCancellationPage() {
  const [kind, setKind] = useState<FileKind | ''>('');
  const [clientId, setClientId] = useState('');
  const [licenseIds, setLicenseIds] = useState<string[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [cancelledDate, setCancelledDate] = useState(today);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [reasons, setReasons] = useState<{ value: string; label: string }[]>([]);
  const [options, setOptions] = useState<Options>({ licensed: true, licenses: [], files: [] });
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [rows, setRows] = useState<CancelledRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    void fetchClientOptions().then(setClients);
    void fetchMasterOptions('cancellation-reasons', 'reason_name').then((o) =>
      setReasons(o.map((r) => ({ value: String(r.id), label: r.label }))),
    );
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    const res = await safeFetchJson<CancelledRow[]>('/api/v1/file-cancellations');
    setRows(res.ok ? res.data : []);
    setLoadingRows(false);
  }, []);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // Licences, then the files on the licences picked. One endpoint answers both,
  // so the file list is always scoped by exactly the licences on screen.
  const loadOptions = useCallback(async (k: FileKind | '', client: string, licenses: string[]) => {
    if (!k || !client) {
      setOptions({ licensed: k !== 'local', licenses: [], files: [] });
      return;
    }
    setLoadingOptions(true);
    const p = new URLSearchParams({ kind: k, client_id: client });
    if (licenses.length > 0) p.set('license_ids', licenses.join(','));
    const res = await safeFetchJson<Options>(`/api/v1/file-cancellations/options?${p}`);
    setLoadingOptions(false);
    if (!res.ok) {
      setOptionsError(res.message);
      return;
    }
    setOptionsError(null);
    setOptions(res.data);
  }, []);

  useEffect(() => {
    void loadOptions(kind, clientId, licenseIds);
  }, [kind, clientId, licenseIds, loadOptions]);

  // A file whose licence was un-ticked leaves the selection with it.
  useEffect(() => {
    const offered = new Set(options.files.map((f) => String(f.id)));
    setFileIds((prev) => {
      const kept = prev.filter((id) => offered.has(id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [options.files]);

  const changeKind = (v: string): void => {
    setKind(v as FileKind | '');
    setLicenseIds([]);
    setFileIds([]);
  };
  const changeClient = (v: string): void => {
    setClientId(v);
    setLicenseIds([]);
    setFileIds([]);
  };

  const licenseOptions = useMemo<MultiSelectOption[]>(
    () =>
      options.licenses.map((l) => ({
        value: String(l.id),
        label: l.license_number,
        badge: `${l.files} ${l.files === 1 ? 'file' : 'files'}`,
      })),
    [options.licenses],
  );
  const fileOptions = useMemo<MultiSelectOption[]>(
    () => options.files.map((f) => ({ value: String(f.id), label: f.mca_ref, detail: f.detail })),
    [options.files],
  );
  const chosenRefs = useMemo(
    () => options.files.filter((f) => fileIds.includes(String(f.id))).map((f) => f.mca_ref),
    [options.files, fileIds],
  );

  const licensed = kind !== 'local';
  const missing = !kind
    ? 'kind'
    : !clientId
      ? 'client'
      : fileIds.length === 0
        ? 'files'
        : !reasonId
          ? 'reason'
          : !cancelledDate
            ? 'date'
            : null;

  const openConfirm = (): void => {
    if (missing) {
      setInvalid(missing);
      return;
    }
    setInvalid(null);
    setConfirming(true);
  };

  const submit = async (): Promise<void> => {
    setSaving(true);
    const res = await safeFetchJson<{ cancelled: string[] }>('/api/v1/file-cancellations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        client_id: Number(clientId),
        file_ids: fileIds.map(Number),
        reason_id: Number(reasonId),
        cancelled_date: cancelledDate,
      }),
    });
    setSaving(false);
    setConfirming(false);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not cancelled', message: res.message || 'The files could not be cancelled.' });
      return;
    }
    const n = res.data.cancelled.length;
    setResult({
      status: 'success',
      title: 'Cancelled',
      message: `${n === 1 ? 'The file' : `${n} files`} ${res.data.cancelled.join(', ')} ${n === 1 ? 'is' : 'are'} now CANCELLED. The reason and date were added to the remarks, and the weight / FOB returned to the licence.`,
    });
    setFileIds([]);
    setReasonId('');
    void loadOptions(kind, clientId, licenseIds);
    void loadRows();
  };

  const hint = !kind
    ? 'Choose the tracking type first.'
    : !clientId
      ? 'Choose a client.'
      : optionsError
        ? optionsError
        : licensed && licenseIds.length === 0
          ? 'Choose the licences to list their files.'
          : !loadingOptions && options.files.length === 0
            ? 'No live file to cancel for this choice.'
            : null;

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="h-1 w-full bg-brand-gradient" />
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <FileX2 className="h-5 w-5 text-primary-600" /> File Cancellation
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            A cancelled file keeps its record and history: it is marked CANCELLED, the reason and date go into its
            remarks, it leaves the invoice and payment pickers, and its weight / FOB return to the licence.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 bg-brand-gradient px-4 py-3 text-white">
          <Ban className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Choose the files to cancel</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <Step n={1}>Tracking Type</Step>
            <SearchableSelect
              value={kind}
              onChange={changeKind}
              options={KIND_OPTIONS}
              placeholder="Import / Export / Local"
              required
              invalid={invalid === 'kind'}
              aria-label="Tracking Type"
            />
          </div>
          <div className="min-w-0">
            <Step n={2}>Client</Step>
            <SearchableSelect
              value={clientId}
              onChange={changeClient}
              options={clients}
              placeholder="Select client"
              disabled={!kind}
              required
              invalid={invalid === 'client'}
              aria-label="Client"
            />
          </div>
          {licensed && (
            <div className="min-w-0">
              <Step n={3}>License Numbers</Step>
              <MultiSelect
                values={licenseIds}
                onChange={setLicenseIds}
                options={licenseOptions}
                placeholder="Select licences"
                noun="Licenses"
                emptyText="This client has no licence with a live file"
                disabled={!kind || !clientId}
                required
                aria-label="License Numbers"
              />
            </div>
          )}
          <div className="min-w-0">
            <Step n={licensed ? 4 : 3}>MCA References</Step>
            <MultiSelect
              values={fileIds}
              onChange={setFileIds}
              options={fileOptions}
              placeholder={licensed && licenseIds.length === 0 ? 'Select licences first' : 'Select MCA references'}
              noun="MCAs"
              emptyText="No live file to cancel"
              disabled={!kind || !clientId || (licensed && licenseIds.length === 0)}
              required
              invalid={invalid === 'files'}
              aria-label="MCA References"
            />
          </div>
          <div className="min-w-0">
            <Step n={licensed ? 5 : 4}>Cancellation Reason</Step>
            <SearchableSelect
              value={reasonId}
              onChange={setReasonId}
              options={reasons}
              placeholder="Select reason"
              required
              invalid={invalid === 'reason'}
              aria-label="Cancellation Reason"
            />
          </div>
          <div className="min-w-0">
            <Step n={licensed ? 6 : 5}>Cancelled Date</Step>
            <input
              id="cancelled_date"
              type="date"
              aria-label="Cancelled Date"
              className="input"
              value={cancelledDate}
              max={today()}
              onChange={(e) => setCancelledDate(e.target.value)}
              required
              aria-invalid={invalid === 'date' || undefined}
            />
          </div>
        </div>
        {chosenRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To cancel</span>
            {chosenRefs.slice(0, 12).map((ref) => (
              <span
                key={ref}
                className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                {ref}
              </span>
            ))}
            {chosenRefs.length > 12 && (
              <span className="text-xs text-muted-foreground">+{chosenRefs.length - 12} more</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {invalid
              ? 'Fill in the fields marked in red.'
              : hint ??
                (fileIds.length > 0
                  ? `${fileIds.length} file${fileIds.length === 1 ? '' : 's'} selected for cancellation.`
                  : '')}
          </p>
          <button type="button" className="btn-danger" onClick={openConfirm} disabled={saving}>
            <Ban className="h-4 w-4" /> Cancel Files
          </button>
        </div>
      </div>

      <DataTable<CancelledRow>
        title="Cancelled Files"
        rows={rows}
        loading={loadingRows}
        rowKey={(r) => r.key}
        searchPlaceholder="Search type, MCA ref, client, licence, reason, date..."
        exportHref="/api/v1/file-cancellations/export"
        emptyMessage="No file has been cancelled yet — choose one above to cancel it."
        columns={[
          {
            key: 'kind_label',
            header: 'Type',
            sortable: true,
            render: (r) => (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {r.kind_label}
              </span>
            ),
          },
          { key: 'mca_ref', header: 'MCA Reference', sortable: true, className: 'font-mono' },
          {
            key: 'client_name',
            header: 'Client',
            sortable: true,
            // The column shows the code; the search also finds the legal name (§4.15).
            value: (r) => `${r.client_name ?? ''} ${r.client_legal_name ?? ''}`,
            render: (r) => r.client_name ?? '—',
          },
          { key: 'license_number', header: 'License Number', sortable: true, render: (r) => r.license_number ?? '—' },
          { key: 'weight', header: 'Weight (kg)', align: 'right', sortable: true, render: (r) => money(r.weight) },
          { key: 'fob', header: 'FOB', align: 'right', sortable: true, render: (r) => (r.fob == null ? '—' : money(r.fob)) },
          { key: 'reason', header: 'Reason', sortable: true, render: (r) => r.reason ?? '—' },
          { key: 'cancelled_date', header: 'Cancelled Date', sortable: true, render: (r) => formatDate(r.cancelled_date) },
          { key: 'cancelled_by', header: 'Cancelled By', sortable: true, render: (r) => r.cancelled_by ?? '—' },
        ]}
      />

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-files-title">
          <div className="card w-full max-w-lg overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-500/10">
              <span className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <span>
                  <h2 id="cancel-files-title" className="font-semibold text-red-800 dark:text-red-200">
                    Cancel {chosenRefs.length} file{chosenRefs.length === 1 ? '' : 's'}?
                  </h2>
                  <span className="block text-xs text-red-700 dark:text-red-300">
                    {reasons.find((r) => r.value === reasonId)?.label} · {formatDate(cancelledDate)}
                  </span>
                </span>
              </span>
              <button type="button" onClick={() => setConfirming(false)} aria-label="Close" className="shrink-0 rounded p-1 text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/20">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-foreground">
              <div className="flex flex-wrap gap-1.5">
                {chosenRefs.map((ref) => (
                  <span key={ref} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{ref}</span>
                ))}
              </div>
              <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                <li>The clearing status becomes CANCELLED, with the reason and date in the remarks.</li>
                <li>They leave the invoice and payment request pickers.</li>
                <li>Their weight / FOB return to the licence.</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">Back</button>
              <button type="button" onClick={() => void submit()} className="btn-danger" disabled={saving}>
                {saving ? 'Cancelling…' : 'Cancel Files'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}
