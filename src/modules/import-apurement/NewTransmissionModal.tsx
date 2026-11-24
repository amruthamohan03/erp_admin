'use client';

// Import Apurement → New Transmission. Pick a client with files ready to send,
// one of its licences, the bank and the two dates; every ready file of that
// licence goes into the transmission. The reference is shown before saving but
// issued by the server (§4.33), so what is shown is what the record gets unless
// someone else takes the number first.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { clientOptionLabel } from '@/lib/clientOptions';
import { formatDate, toDateInputValue } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import type {
  ApurementClient,
  ApurementFileRow,
  LicenceApurementSummary,
  ReadyLicence,
} from '@/db/queries/importApurement';
import { formatMoney } from '@/lib/exchangeRates';

interface Props {
  /** Preselects the dashboard's client filter, when one is set. */
  initialClientId?: string;
  onClose: () => void;
  onResult: (result: SaveResult, created: boolean) => void;
}

const API = '/api/v1/import-apurement';

export default function NewTransmissionModal({ initialClientId, onClose, onResult }: Props) {
  const today = toDateInputValue(new Date());
  const [clients, setClients] = useState<ApurementClient[]>([]);
  const [banks, setBanks] = useState<Array<{ id: number; label: string }>>([]);
  const [licences, setLicences] = useState<ReadyLicence[]>([]);
  const [clientId, setClientId] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [bankId, setBankId] = useState('');
  const [date, setDate] = useState(today);
  const [dateDepot, setDateDepot] = useState(today);
  const [reference, setReference] = useState<string | null>(null);
  const [summary, setSummary] = useState<LicenceApurementSummary | null>(null);
  const [files, setFiles] = useState<ApurementFileRow[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // The parent passes a fresh callback each render; reading it through a ref
  // keeps the loaders below from refetching (and, on a failure, looping) every
  // time the dashboard re-renders.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    safeFetchJson<ApurementClient[]>(`${API}/clients?state=ready`).then((res) => {
      if (cancelled || !res.ok) return;
      setClients(res.data);
      // Only a client that has something to send can be preselected.
      if (initialClientId && res.data.some((c) => String(c.id) === initialClientId)) setClientId(initialClientId);
    });
    fetchMasterOptions('banks', 'bank_name').then((b) => { if (!cancelled) setBanks(b); });
    return () => { cancelled = true; };
  }, [initialClientId]);

  // A client change resets everything that hangs off it.
  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLicenseId('');
    setLicences([]);
    setReference(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!clientId) return;
    safeFetchJson<ReadyLicence[]>(`${API}/transmissions/ready-licences?client_id=${clientId}`).then((res) => {
      if (!cancelled && res.ok) setLicences(res.data);
    });
    safeFetchJson<{ refs: string[] }>(`/api/v1/mca-ref-formats/preview?target=import-apurement&client_id=${clientId}`).then((res) => {
      if (!cancelled && res.ok) setReference(res.data.refs[0] ?? null);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSummary(null);
    setFiles([]);
    if (!licenseId) return;
    setFilesLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    safeFetchJson<{ summary: LicenceApurementSummary; files: ApurementFileRow[] }>(
      `${API}/transmissions/ready-files?license_id=${licenseId}`,
    )
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setSummary(res.data.summary);
          setFiles(res.data.files);
        } else {
          onResultRef.current({ status: 'error', title: 'Not loaded', message: res.message }, false);
        }
      })
      .finally(() => { if (!cancelled) setFilesLoading(false); });
    return () => { cancelled = true; };
  }, [licenseId]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: `${clientOptionLabel({ ...c })} (${c.file_count})` })),
    [clients],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await safeFetchJson<{ reference: string; files: number }>(`${API}/transmissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Number(clientId),
          license_id: Number(licenseId),
          bank_id: Number(bankId),
          transmission_date: date,
          date_depot: dateDepot,
        }),
      });
      if (!res.ok) {
        // §4.22 — failure dismisses in place; the form keeps what was chosen.
        onResult({ status: 'error', title: 'Not created', message: res.message, detail: res.detail }, false);
        return;
      }
      onResult(
        {
          status: 'success',
          title: 'Created',
          message: `Transmission ${res.data.reference} has been created with ${res.data.files} file${res.data.files === 1 ? '' : 's'}.`,
        },
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !!clientId && !!licenseId && !!bankId && !!date && !!dateDepot && files.length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <form onSubmit={submit} className="card my-auto w-full max-w-6xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">New Transmission (Apurement IB)</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="min-w-0">
              <label className="label required">Client</label>
              <SearchableSelect
                value={clientId}
                onChange={setClientId}
                options={clientOptions}
                placeholder={clients.length ? 'Choose a client' : 'No client has files ready'}
                aria-label="Client"
                required
              />
            </div>
            <div className="min-w-0">
              <label className="label required">Licence</label>
              <SearchableSelect
                value={licenseId}
                onChange={setLicenseId}
                options={licences.map((l) => ({ value: String(l.id), label: `${l.license_number ?? `#${l.id}`} (${l.file_count})` }))}
                placeholder={clientId ? 'Choose a licence' : 'Choose a client first'}
                disabled={!clientId}
                aria-label="Licence"
                required
              />
            </div>
            <div className="min-w-0">
              <label className="label required">Bank</label>
              <SearchableSelect
                value={bankId}
                onChange={setBankId}
                options={banks.map((b) => ({ value: String(b.id), label: b.label }))}
                placeholder="Choose a bank"
                aria-label="Bank"
                required
              />
            </div>
            <div>
              <label className="label required" htmlFor="tx-date">Date</label>
              <input id="tx-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label className="label required" htmlFor="tx-depot">Date Depot</label>
              <input id="tx-depot" type="date" className="input" value={dateDepot} min={date} onChange={(e) => setDateDepot(e.target.value)} required />
            </div>
            <div>
              <span className="label">Reference</span>
              <p className="input flex items-center bg-muted/50 font-mono font-semibold" title="Issued when the transmission is saved">
                {reference ?? NO_VALUE}
              </p>
            </div>
          </div>

          {summary && <LicenceSummary summary={summary} />}

          <DataTable<ApurementFileRow>
            tableId="apurement-new-transmission"
            rows={files}
            loading={filesLoading}
            rowKey={(f) => f.import_id}
            title="Files to transmit"
            searchPlaceholder="Search file ref, declaration, liquidation, quittance..."
            emptyMessage={
              licenseId
                ? 'No file on this licence is ready — complete ASS REF and Type on the pending grid.'
                : 'Choose a client and a licence to see the files that will be sent.'
            }
            columns={[
              { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
              { key: 'license_number', header: 'Licence', className: 'text-xs' },
              { key: 'cif', header: 'Montant Decl.', align: 'right', className: 'tabular-nums text-xs', render: (f) => formatMoney(f.cif) },
              { key: 'ref_decl', header: 'Ref. Decl.', className: 'text-xs' },
              { key: 'ref_liquid', header: 'Ref. Liq.', className: 'text-xs' },
              { key: 'ref_quit', header: 'Ref. Quit.', className: 'text-xs' },
              { key: 'date_quit', header: 'Date Quit.', className: 'text-xs', render: (f) => formatDate(f.date_quit) },
              { key: 'clearance_type', header: 'Type', className: 'text-xs' },
              { key: 'clearance_remark', header: 'Remarque', className: 'text-xs' },
            ]}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={!canSubmit} className="btn-primary">
            <Send className="h-4 w-4" /> {saving ? 'Creating…' : `Create transmission${files.length ? ` (${files.length})` : ''}`}
          </button>
        </div>
      </form>
    </div>
  );
}

function LicenceSummary({ summary }: { summary: LicenceApurementSummary }) {
  const cols = [
    ['Poids Net', 'weight'],
    ['FOB', 'fob'],
    ['Fret', 'fret'],
    ['Assurance', 'assurance'],
    ['Autres', 'autres'],
    ['CIF', 'cif'],
  ] as const;
  const lines = [
    ['Licence', summary.license, 'text-foreground'],
    ['Used', summary.used, 'text-muted-foreground'],
    ['Remaining', summary.remaining, 'text-foreground font-semibold'],
  ] as const;
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{summary.license_number ?? NO_VALUE}</span>
        <span className="text-muted-foreground">Currency: <span className="text-foreground">{summary.currency || NO_VALUE}</span></span>
        <span className="text-muted-foreground">Validation: <span className="text-foreground">{formatDate(summary.date_val)}</span></span>
        <span className="text-muted-foreground">Expiry: <span className="text-foreground">{formatDate(summary.date_ech)}</span></span>
        <span className="text-muted-foreground">Files on licence: <span className="text-foreground">{summary.total_files}</span></span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base whitespace-nowrap text-xs">
          <thead>
            <tr>
              <th />
              {cols.map(([label]) => <th key={label} className="text-right">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, values, cls]) => (
              <tr key={label}>
                <th className="text-left">{label}</th>
                {cols.map(([, key]) => (
                  <td key={key} className={`text-right tabular-nums ${cls}`}>{formatMoney(values[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
