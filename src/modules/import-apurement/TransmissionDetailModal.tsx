'use client';

// Import Apurement → one transmission: the files it carried, the sheet that goes
// to the bank, and the bank's acknowledgement of receipt (AR) once it is back.
import { useCallback, useEffect, useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import FileUpload from '@/components/ui/FileUpload';
import type { SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import type { ApurementFileRow, TransmissionRow } from '@/db/queries/importApurement';
import { formatMoney } from '@/lib/exchangeRates';

interface Props {
  transmissionId: number;
  onClose: () => void;
  /** The transmission changed (its AR) — the list behind should reload. */
  onChanged: () => void;
  onResult: (result: SaveResult) => void;
}

const AR_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx';

export default function TransmissionDetailModal({ transmissionId, onClose, onChanged, onResult }: Props) {
  const [transmission, setTransmission] = useState<TransmissionRow | null>(null);
  const [files, setFiles] = useState<ApurementFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const api = `/api/v1/import-apurement/transmissions/${transmissionId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeFetchJson<{ transmission: TransmissionRow; files: ApurementFileRow[] }>(api);
      if (res.ok) {
        setTransmission(res.data.transmission);
        setFiles(res.data.files);
      } else {
        onResult({ status: 'error', title: 'Not loaded', message: res.message });
      }
    } finally {
      setLoading(false);
    }
  }, [api, onResult]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function setAr(fileId: number | null) {
    const res = await safeFetchJson(`${api}/ar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!res.ok) {
      onResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
      return;
    }
    onResult({
      status: 'success',
      title: 'Saved',
      message: fileId
        ? `The acknowledgement of receipt is attached to transmission ${transmission?.transmission_reference ?? ''}.`
        : `The acknowledgement of receipt was removed from transmission ${transmission?.transmission_reference ?? ''}.`,
    });
    await load();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="card my-auto w-full max-w-7xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">
            Transmission {transmission?.transmission_reference ?? ''}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {transmission && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Client', transmission.client_short || NO_VALUE],
                ['Licence', transmission.license_number || NO_VALUE],
                ['Bank', transmission.bank_name || NO_VALUE],
                ['Date', formatDate(transmission.transmission_date)],
                ['Date Depot', formatDate(transmission.date_depot)],
                ['Files', String(transmission.file_count)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                  <div className="truncate text-sm font-semibold text-foreground" title={value}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {transmission && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-semibold text-foreground">Acknowledgement of receipt (AR)</div>
              {transmission.ar_file_id ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="truncate text-foreground" title={transmission.ar_file_name ?? ''}>
                    {transmission.ar_file_name || 'The stored file is missing — attach it again.'}
                  </span>
                  <a href={`/api/v1/files/${transmission.ar_file_id}/view`} target="_blank" rel="noreferrer" className="btn-neutral btn-sm">
                    <Eye className="h-4 w-4" /> View
                  </a>
                  <button
                    type="button"
                    onClick={() => { if (confirm('Remove the acknowledgement of receipt from this transmission?')) setAr(null); }}
                    className="btn-delete btn-sm"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </div>
              ) : (
                <FileUpload
                  value={null}
                  onChange={(v) => { if (v) setAr(v.id); }}
                  entityType="import_transmission"
                  entityId={String(transmissionId)}
                  label="Upload the bank's AR (PDF, JPG, PNG or DOCX, up to 10 MB)"
                  accept={AR_ACCEPT}
                />
              )}
            </div>
          )}

          <DataTable<ApurementFileRow>
            tableId="apurement-transmission-files"
            rows={files}
            loading={loading}
            rowKey={(f) => f.import_id}
            title="Files in this transmission"
            searchPlaceholder="Search file ref, licence, AV, invoice, references..."
            emptyMessage="This transmission carries no files."
            exportHref={`${api}/export`}
            columns={[
              { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
              { key: 'license_number', header: 'Licence', className: 'text-xs' },
              { key: 'monnaie', header: 'Currency', className: 'text-xs' },
              { key: 'date_val', header: 'Date Val', className: 'text-xs', render: (f) => formatDate(f.date_val) },
              { key: 'date_ech', header: 'Date Ech', className: 'text-xs', render: (f) => formatDate(f.date_ech) },
              { key: 'cif', header: 'CIF / Montant Apuré', align: 'right', className: 'tabular-nums text-xs', render: (f) => formatMoney(f.cif) },
              { key: 'num_av', header: 'Num. AV', className: 'text-xs' },
              { key: 'montant_av', header: 'Montant AV', align: 'right', className: 'tabular-nums text-xs', render: (f) => formatMoney(f.montant_av) },
              { key: 'facture', header: 'Facture', className: 'text-xs' },
              { key: 'ref_decl', header: 'Ref. Decl.', className: 'text-xs' },
              { key: 'ref_liquid', header: 'Ref. Liq.', className: 'text-xs' },
              { key: 'ref_quit', header: 'Ref. Quit.', className: 'text-xs' },
              { key: 'bl_lta', header: 'BL/LTA', className: 'text-xs' },
              { key: 'clearance_type', header: 'Type', className: 'text-xs' },
              { key: 'clearance_remark', header: 'Remarque', className: 'text-xs' },
            ]}
          />
        </div>

        <div className="flex justify-end border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
