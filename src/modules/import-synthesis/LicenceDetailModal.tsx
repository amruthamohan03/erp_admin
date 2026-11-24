'use client';

// Import Synthesis → one licence: its figures and balances, a summary of its
// files, and each file with how far it has got towards the bank (Import
// Apurement's transmissions).
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import type { SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import type { SynthesisFile, SynthesisFileSummary, SynthesisLicense } from '@/db/queries/importSynthesis';
import { formatMoney } from '@/lib/exchangeRates';

interface Props {
  licenseId: number;
  onClose: () => void;
  onResult: (result: SaveResult) => void;
}

interface Detail {
  license: SynthesisLicense;
  summary: SynthesisFileSummary;
  files: SynthesisFile[];
}

export default function LicenceDetailModal({ licenseId, onClose, onResult }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  // Read through a ref: the parent passes a fresh callback each render.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    safeFetchJson<Detail>(`/api/v1/import-synthesis/licenses/${licenseId}`)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDetail(res.data);
        else onResultRef.current({ status: 'error', title: 'Not loaded', message: res.message });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [licenseId]);

  const l = detail?.license;
  const s = detail?.summary;

  const tiles: Array<[string, string, boolean?]> = l && s
    ? [
        ['Client', l.client_short || NO_VALUE],
        ['FOB', formatMoney(l.fob)],
        ['Weight (KG)', formatMoney(l.weight)],
        ['FOB balance', formatMoney(l.fob_balance), l.fob_balance < 0],
        ['Weight balance', formatMoney(l.weight_balance), l.weight_balance < 0],
        ['Files', String(s.files)],
        ['FOB of files', formatMoney(s.fob)],
        ['Weight of files', formatMoney(s.weight)],
        ['Files sent to bank', String(s.transmitted)],
        ['FOB sent to bank', formatMoney(s.transmitted_fob)],
        ['FOB not yet sent', formatMoney(s.fob_not_transmitted), s.fob_not_transmitted < 0],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="card my-auto w-full max-w-7xl">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="flex items-center gap-3 font-semibold text-foreground">
            Licence {l?.license_number ?? ''}
            {l && <StatusBadge status={l.status} />}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {tiles.map(([label, value, negative]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                  <div className={`truncate text-sm font-semibold tabular-nums ${negative ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`} title={value}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DataTable<SynthesisFile>
            tableId="synthesis-licence-files"
            rows={detail?.files ?? []}
            loading={loading}
            rowKey={(f) => f.import_id}
            title="Files on this licence"
            searchPlaceholder="Search file ref, AV, declaration, liquidation, quittance, transmission..."
            emptyMessage="No import file has used this licence yet."
            columns={[
              { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
              { key: 'num_av', header: 'Ref AV', className: 'text-xs' },
              { key: 'montant_av', header: 'Montant AV', align: 'right', className: 'tabular-nums text-xs', render: (f) => formatMoney(f.montant_av) },
              { key: 'ref_decl', header: 'N° E', className: 'text-xs' },
              { key: 'date_decl', header: 'Date E', sortable: true, className: 'text-xs', render: (f) => formatDate(f.date_decl) },
              { key: 'ref_liquid', header: 'N° L', className: 'text-xs' },
              { key: 'date_liquid', header: 'Date L', sortable: true, className: 'text-xs', render: (f) => formatDate(f.date_liquid) },
              { key: 'ref_quit', header: 'N° Q', className: 'text-xs' },
              { key: 'date_quit', header: 'Date Q', sortable: true, className: 'text-xs', render: (f) => formatDate(f.date_quit) },
              { key: 'fob', header: 'FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (f) => formatMoney(f.fob) },
              { key: 'weight', header: 'Weight', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (f) => formatMoney(f.weight) },
              {
                key: 'transmitted',
                header: 'Transmitted',
                value: (f) => (f.transmission_reference ? 'Transmitted' : 'Not transmitted'),
                badge: (f) => (f.transmission_reference ? 'emerald' : 'amber'),
              },
              {
                key: 'transmission_reference',
                header: 'Transmission',
                className: 'text-xs',
                value: (f) => (f.transmission_reference ? `${f.transmission_reference} ${formatDate(f.transmission_date)}` : ''),
                render: (f) => (f.transmission_reference ? `${f.transmission_reference} du ${formatDate(f.transmission_date)}` : NO_VALUE),
              },
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
