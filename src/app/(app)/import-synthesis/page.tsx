'use client';

// Import License → Import Synthesis ("Synthèse Licences").
//
//   1. One card per active kind (Masters → Kind), with its licence count.
//   2. A card opens the clients holding licences of that kind.
//   3. A client opens the synthesis: every licence of that kind — values,
//      files, balances, apurement — with four totals that filter the table.
//   4. A licence opens its files and how far each has got towards the bank.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, FileWarning, Layers, Plus, X } from 'lucide-react';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';
import { formatMoney } from '@/lib/exchangeRates';
import type { ToneKey } from '@/lib/statusTone';
import type {
  ApurementState,
  SynthesisClient,
  SynthesisKind,
  SynthesisLicense,
} from '@/db/queries/importSynthesis';
import LicenceDetailModal from '@/modules/import-synthesis/LicenceDetailModal';

const API = '/api/v1/import-synthesis';

/**
 * The kind cards' colours, in card order — the legacy page's violet, green,
 * amber, orange, then onward. By POSITION, never by kind name (§4.1): renaming
 * or adding a kind cannot misassign a colour that means something.
 */
const KIND_COLORS = ['violet', 'emerald', 'amber', 'orange', 'sky', 'rose', 'teal', 'fuchsia'];

const APUREMENT: Record<ApurementState, { label: string; tone: ToneKey }> = {
  apured: { label: 'Apured', tone: 'emerald' },
  partial: { label: 'Partly apured', tone: 'sky' },
  not: { label: 'Not apured', tone: 'amber' },
  none: { label: 'No files', tone: 'slate' },
};

type Totals = 'all' | 'apured' | 'partial' | 'no-document';

/** An amount cell; a balance below zero is shown in red — the licence is over-used. */
function amount(v: number, balance = false) {
  return (
    <span className={balance && v < 0 ? 'font-semibold text-red-700 dark:text-red-400' : undefined}>
      {formatMoney(v)}
    </span>
  );
}

export default function ImportSynthesisPage() {
  const [kinds, setKinds] = useState<SynthesisKind[] | null>(null);
  const [kind, setKind] = useState<SynthesisKind | null>(null);
  const [client, setClient] = useState<SynthesisClient | null>(null);
  const [pickingFor, setPickingFor] = useState<SynthesisKind | null>(null);
  const [licences, setLicences] = useState<SynthesisLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<Totals>('all');
  const [viewing, setViewing] = useState<number | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    safeFetchJson<SynthesisKind[]>(`${API}/kinds`).then((res) => {
      if (res.ok) setKinds(res.data);
      else {
        setKinds([]);
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
      }
    });
  }, []);

  const loadLicences = useCallback(async () => {
    if (!kind || !client) return;
    setLoading(true);
    try {
      const res = await safeFetchJson<SynthesisLicense[]>(`${API}/licenses?kind_id=${kind.kind_id}&client_id=${client.client_id}`);
      if (res.ok) setLicences(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setLoading(false);
    }
  }, [kind, client]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLicences();
  }, [loadLicences]);

  const counts = useMemo(
    () => ({
      all: licences.length,
      apured: licences.filter((l) => l.apurement === 'apured').length,
      partial: licences.filter((l) => l.apurement === 'partial').length,
      noDocument: licences.filter((l) => !l.license_file).length,
    }),
    [licences],
  );

  const shown = useMemo(() => {
    if (totals === 'apured') return licences.filter((l) => l.apurement === 'apured');
    if (totals === 'partial') return licences.filter((l) => l.apurement === 'partial');
    if (totals === 'no-document') return licences.filter((l) => !l.license_file);
    return licences;
  }, [licences, totals]);

  function back() {
    setKind(null);
    setClient(null);
    setLicences([]);
    setTotals('all');
  }

  const columns: DataTableColumn<SynthesisLicense>[] = [
    { key: 'license_number', header: 'N° Licence', sortable: true, className: 'font-mono text-xs font-medium' },
    { key: 'ref_cod', header: 'Réf. COD', sortable: true, className: 'font-mono text-xs' },
    { key: 'status', header: 'Status', badge: true },
    {
      key: 'apurement',
      header: 'Apurement',
      value: (l) => APUREMENT[l.apurement].label,
      badge: (l) => APUREMENT[l.apurement].tone,
    },
    { key: 'applied_date', header: 'Date Appl.', sortable: true, className: 'text-xs', render: (l) => formatDate(l.applied_date) },
    { key: 'validation_date', header: 'Date Val.', sortable: true, className: 'text-xs', render: (l) => formatDate(l.validation_date) },
    { key: 'expiry_date', header: 'Extrême Val.', sortable: true, className: 'text-xs', render: (l) => formatDate(l.expiry_date) },
    { key: 'supplier', header: 'Fournisseur', className: 'text-xs' },
    { key: 'goods_type', header: 'Marchandise', className: 'text-xs' },
    { key: 'currency', header: 'Monnaie', className: 'text-xs' },
    { key: 'fob', header: 'FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (l) => amount(l.fob) },
    { key: 'insurance', header: 'Assurance', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.insurance) },
    { key: 'freight', header: 'Fret', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.freight) },
    { key: 'other_costs', header: 'Autres Frais', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.other_costs) },
    { key: 'cif', header: 'CIF', align: 'right', sortable: true, className: 'tabular-nums text-xs font-semibold', render: (l) => amount(l.cif) },
    { key: 'weight', header: 'Poids (KG)', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.weight) },
    { key: 'bank', header: 'Banque', className: 'text-xs' },
    { key: 'files', header: 'Dossiers', align: 'center', sortable: true, className: 'tabular-nums' },
    { key: 'fob_balance', header: 'Bal. FOB', align: 'right', sortable: true, className: 'tabular-nums text-xs', render: (l) => amount(l.fob_balance, true) },
    { key: 'insurance_balance', header: 'Bal. Assurance', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.insurance_balance, true) },
    { key: 'freight_balance', header: 'Bal. Fret', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.freight_balance, true) },
    { key: 'other_balance', header: 'Bal. Autres', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.other_balance, true) },
    { key: 'cif_balance', header: 'Bal. CIF', align: 'right', sortable: true, className: 'tabular-nums text-xs font-semibold', render: (l) => amount(l.cif_balance, true) },
    { key: 'weight_balance', header: 'Bal. Poids', align: 'right', className: 'tabular-nums text-xs', render: (l) => amount(l.weight_balance, true) },
  ];

  // ---- 1. Kind cards -------------------------------------------------------------
  if (!kind || !client) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold text-foreground">Import Synthesis</h1>
        {kinds === null ? (
          <div className="card p-6 text-muted-foreground">Loading…</div>
        ) : kinds.length === 0 ? (
          <div className="card p-6 text-sm text-muted-foreground">
            No active kind is set up — add kinds under Masters → Kind.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kinds.map((k, i) => (
              <StatCard
                key={k.kind_id}
                icon={<Layers className="h-5 w-5" />}
                label={k.kind_name}
                subtitle={`${k.kind_short_name} Licenses`}
                hint="Click to see client breakdown"
                color={KIND_COLORS[i % KIND_COLORS.length]}
                value={k.license_count}
                onClick={() => setPickingFor(k)}
                title={`Show the clients holding ${k.kind_name} licences`}
              />
            ))}
          </div>
        )}

        {pickingFor && (
          <ClientPicker
            kind={pickingFor}
            onClose={() => setPickingFor(null)}
            onPick={(c) => {
              setKind(pickingFor);
              setClient(c);
              setPickingFor(null);
            }}
            onResult={setResult}
          />
        )}
        <ResultDialog result={result} onDismiss={() => setResult(null)} />
      </>
    );
  }

  // ---- 3. The synthesis ----------------------------------------------------------
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={back} className="btn-secondary btn-sm">
          <ArrowLeft className="h-4 w-4" /> Kinds
        </button>
        <h1 className="text-2xl font-bold text-foreground">
          Synthèse licences — {kind.kind_name} — {client.short_name ?? `#${client.client_id}`}
        </h1>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          label="Licences"
          value={counts.all}
          color="violet"
          subtitle={`${kind.kind_name} — ${client.short_name ?? ''}`}
          onClick={() => setTotals('all')}
          active={totals === 'all'}
          title="Show every licence"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Apured"
          value={counts.apured}
          color="emerald"
          subtitle="Every file sent to the bank"
          onClick={() => setTotals((t) => (t === 'apured' ? 'all' : 'apured'))}
          active={totals === 'apured'}
          title="Show licences whose every file has been sent to the bank"
        />
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Partly apured"
          value={counts.partial}
          color="sky"
          subtitle="Some files sent to the bank"
          onClick={() => setTotals((t) => (t === 'partial' ? 'all' : 'partial'))}
          active={totals === 'partial'}
          title="Show licences with some, but not all, files sent to the bank"
        />
        <StatCard
          icon={<FileWarning className="h-5 w-5" />}
          label="Without licence document"
          value={counts.noDocument}
          color="rose"
          subtitle="No Global License uploaded"
          onClick={() => setTotals((t) => (t === 'no-document' ? 'all' : 'no-document'))}
          active={totals === 'no-document'}
          title="Show licences with no Global License file uploaded"
        />
      </div>

      <DataTable<SynthesisLicense>
        tableId="import-synthesis-licences"
        rows={shown}
        loading={loading}
        rowKey={(l) => l.id}
        searchPlaceholder="Search licence, COD, supplier, goods, bank, currency..."
        emptyMessage={
          totals === 'all'
            ? 'This client holds no licence of this kind.'
            : 'No licence matches this total — click the Licences card to see them all.'
        }
        exportHref={`${API}/licenses/export?kind_id=${kind.kind_id}&client_id=${client.client_id}`}
        toolbar={
          <Link href="/licenses/new" className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New License
          </Link>
        }
        columns={columns}
        actions={(l) => ({
          view: () => setViewing(l.id),
          extra:
            l.license_file && /^\d+$/u.test(l.license_file) ? (
              <a
                href={`/api/v1/files/${l.license_file}/view`}
                target="_blank"
                rel="noreferrer"
                title="Open the licence document"
                className="btn-neutral btn-icon"
              >
                <FileText className="h-3.5 w-3.5" />
              </a>
            ) : undefined,
        })}
      />

      {viewing !== null && (
        <LicenceDetailModal licenseId={viewing} onClose={() => setViewing(null)} onResult={setResult} />
      )}
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

// ---- 2. Client breakdown ---------------------------------------------------------

function ClientPicker({
  kind,
  onClose,
  onPick,
  onResult,
}: {
  kind: SynthesisKind;
  onClose: () => void;
  onPick: (client: SynthesisClient) => void;
  onResult: (r: SaveResult) => void;
}) {
  const [clients, setClients] = useState<SynthesisClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    safeFetchJson<SynthesisClient[]>(`${API}/kinds/${kind.kind_id}/clients`)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setClients(res.data);
        else onResult({ status: 'error', title: 'Not loaded', message: res.message });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onResult is the page's state setter — stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind.kind_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="card my-auto w-full max-w-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">{kind.kind_name} — clients</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <DataTable<SynthesisClient>
            tableId="import-synthesis-clients"
            rows={clients}
            loading={loading}
            rowKey={(c) => c.client_id}
            searchPlaceholder="Search client code or name..."
            emptyMessage="No client holds a licence of this kind."
            columns={[
              { key: 'short_name', header: 'Client', sortable: true, className: 'font-medium' },
              { key: 'license_count', header: 'Licences', align: 'center', sortable: true, className: 'tabular-nums' },
            ]}
            actions={(c) => ({ view: () => onPick(c) })}
          />
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
