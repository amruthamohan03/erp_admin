'use client';

// §2 step 3 — Fiche de Calcul list (ports main's fiches.php). A stat card per
// workflow state filters the list; the create/edit form is a panel above it, as
// in main; each row prints, edits, deletes, and offers the workflow steps that
// lead out of its state (Verify, Audit as seeded).
//
// The states and the steps are read from the workflow (GET /fiches/summary), so
// adding a stage is a workflow_transition_master_t row — this screen renders it
// with no change (§4.6). Editing and deleting stop at a state with no way out.
import { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle2, Plus, Printer } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import TransactionFormPanel from '@/components/transactional/TransactionFormPanel';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';
import StatusBadge from '@/components/ui/StatusBadge';

interface Row {
  id: number;
  fiche_reference: string | null;
  client_name: string | null;
  client_legal_name: string | null;
  license_number: string | null;
  mca_ref: string | null;
  fiche_date: string | null;
  poids: number;
  cif: number;
  total_ddi: number;
  state: string | null;
}

interface Workflow {
  initial_state: string;
  transitions: { key: string; from: string; to: string }[];
  states: string[];
}

const fmt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Workflow keys are snake_case; the screen shows them as words. */
const words = (s: string | null | undefined): string =>
  String(s ?? '').replace(/_/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());


export default function FicheListPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [formId, setFormId] = useState('new');
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState<{ row: Row; kind: 'delete' | 'step'; step?: Workflow['transitions'][number] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set('q', search.trim());
    if (state) p.set('state', state);
    const res = await safeFetchJson<Row[]>(`/api/v1/fiches?${p}`);
    if (res.ok) {
      setItems(res.data);
      setTotal(Number(res.meta?.['total'] ?? 0));
    }
    setLoading(false);
  }, [page, pageSize, search, state]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadSummary = useCallback(async () => {
    const res = await safeFetchJson<{ workflow: Workflow; counts: Record<string, number> }>('/api/v1/fiches/summary');
    if (res.ok) {
      setWorkflow(res.data.workflow);
      setCounts(res.data.counts);
    }
  }, []);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const reload = (): void => {
    void load();
    void loadSummary();
  };

  const editable = (s: string | null): boolean => s == null || !!workflow?.transitions.some((t) => t.from === s);
  const stepsFrom = (s: string | null): Workflow['transitions'] => workflow?.transitions.filter((t) => t.from === s) ?? [];
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const confirm = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    const { row } = pending;
    const ref = row.fiche_reference ?? `#${row.id}`;
    const res =
      pending.kind === 'delete'
        ? await safeFetchJson(`/api/v1/fiches/${row.id}`, { method: 'DELETE' })
        : await safeFetchJson(`/api/v1/fiches/${row.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transition_key: pending.step?.key }),
          });
    setBusy(false);
    setPending(null);
    if (!res.ok) {
      setResult({
        status: 'error',
        title: pending.kind === 'delete' ? 'Not deleted' : 'Not changed',
        message: res.message || `Fiche ${ref} could not be updated.`,
      });
      return;
    }
    setResult(
      pending.kind === 'delete'
        ? { status: 'success', title: 'Deleted', message: `Fiche ${ref} has been deleted.` }
        : { status: 'success', title: 'Saved', message: `Fiche ${ref} is now ${words(pending.step?.to).toUpperCase()}.` },
    );
    reload();
  };

  const exportParams = new URLSearchParams();
  if (search.trim()) exportParams.set('q', search.trim());
  if (state) exportParams.set('state', state);

  return (
    <>
      <div className="card mb-4 overflow-hidden">
        <div className="h-1 w-full bg-brand-gradient" />
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Calculator className="h-5 w-5 text-primary-600" /> Fiche de Calcul
          </h1>
          <p className="text-sm text-muted-foreground">
            Duty calculated per import file — licence, MCA reference, then a line per tariff position.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Calculator className="h-5 w-5" />}
          label="Total Fiches"
          value={totalCount}
          active={state === ''}
          onClick={() => { setState(''); setPage(1); }}
        />
        {(workflow?.states ?? []).map((s) => (
          <StatCard
            key={s}
            icon={<CheckCircle2 className="h-5 w-5" />}
            label={words(s)}
            value={counts[s] ?? 0}
            active={state === s}
            onClick={() => { setState(state === s ? '' : s); setPage(1); }}
          />
        ))}
      </div>

      <TransactionFormPanel
        slug="fiche"
        entityId={formId}
        open={formOpen}
        onToggle={() => setFormOpen((v) => !v)}
        onSaved={() => {
          setFormOpen(false);
          setFormId('new');
          reload();
        }}
        onCancel={() => {
          setFormOpen(false);
          setFormId('new');
        }}
        createTitle="Add New Fiche"
        editTitle="Edit Fiche"
      />

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Fiches List"
        searchPlaceholder="Search fiche ref, client, licence, MCA ref, status, date..."
        emptyMessage="No fiche matches — clear the filters, or raise the first one on an import file."
        exportHref={`/api/v1/fiches/export?${exportParams}`}
        toolbar={
          <button type="button" onClick={() => { setFormId('new'); setFormOpen(true); }} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Fiche
          </button>
        }
        columns={[
          { key: 'fiche_reference', header: 'Fiche Ref', className: 'font-medium font-mono' },
          {
            key: 'client_name',
            header: 'Client',
            // The column shows the code; the search finds the legal name too (§4.15).
            value: (r) => `${r.client_name ?? ''} ${r.client_legal_name ?? ''}`,
            render: (r) => r.client_name ?? '—',
          },
          { key: 'license_number', header: 'License Number', render: (r) => r.license_number ?? '—' },
          { key: 'mca_ref', header: 'MCA Ref', className: 'font-mono', render: (r) => r.mca_ref ?? '—' },
          { key: 'fiche_date', header: 'Fiche Date', render: (r) => formatDate(r.fiche_date) },
          { key: 'poids', header: 'Weight', align: 'right', className: 'tabular-nums', render: (r) => fmt(r.poids) },
          { key: 'cif', header: 'CIF', align: 'right', className: 'tabular-nums', render: (r) => fmt(r.cif) },
          { key: 'total_ddi', header: 'DDI (FC)', align: 'right', className: 'tabular-nums font-semibold', render: (r) => fmt(r.total_ddi) },
          {
            key: 'state',
            header: 'Status',
            value: (r) => words(r.state),
            render: (r) => (
              <StatusBadge status={words(r.state)} />
            ),
          },
        ]}
        actions={(r) => ({
          edit: editable(r.state) ? () => { setFormId(String(r.id)); setFormOpen(true); } : undefined,
          remove: editable(r.state) ? () => setPending({ row: r, kind: 'delete' }) : undefined,
          extra: (
            <>
              <button
                type="button"
                title="Print / PDF"
                onClick={() => window.open(`/api/v1/fiches/${r.id}/print`, '_blank')}
                className="btn-pdf btn-icon ms-1"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              {stepsFrom(r.state).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPending({ row: r, kind: 'step', step: t })}
                  className="btn-approve btn-sm ms-1"
                  title={`${words(t.key)} — moves the fiche to ${words(t.to)}`}
                >
                  {words(t.key)}
                </button>
              ))}
            </>
          ),
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

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'delete'
            ? `Delete fiche ${pending.row.fiche_reference ?? ''}?`
            : `${words(pending?.step?.key)} fiche ${pending?.row.fiche_reference ?? ''}?`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : words(pending?.step?.key)}
        tone={pending?.kind === 'delete' ? 'danger' : 'default'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'delete'
          ? 'The fiche is removed from the list and its import file becomes free for a new fiche.'
          : `The fiche moves from ${words(pending?.step?.from)} to ${words(pending?.step?.to)}.`}
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
