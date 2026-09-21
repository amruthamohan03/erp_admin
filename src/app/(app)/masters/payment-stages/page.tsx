'use client';

// §4.1 / §4.6 — Masters → Payment Stages: the Payment Request approval chain.
//
// Each row is one stage a request passes through. Its name, the status a
// request waiting on it shows, its place in the order, which payment types it
// applies to, its badge colour, and what it asks the approver for are all edited
// here — the approve route, the list's cards and badges, the view dialog and the
// printed Demande de Fonds read them, and none of them states the chain itself.
//
// There is no "New" button, deliberately (the same stance as Reference Formats):
// each stage writes its own columns on payment_request_t, so the five slots are
// fixed. A stage that is not wanted is switched off, not deleted. WHO may act on
// each stage is the sibling screen, Mapping → Role Payment Stage Mapping.
import { useCallback, useEffect, useState } from 'react';
import { ListOrdered, Save, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import { type ToneKey } from '@/lib/payments/stageConfig';
import { PAYMENT_STAGE_TONES } from '@/db/schema';
import StatusBadge from '@/components/ui/StatusBadge';
import { displayLabel } from '@/lib/statusTone';

interface Row {
  id: number;
  stage: string;
  label: string;
  pending_label: string;
  sort_order: number;
  payment_type: 'Bank' | 'Cash' | null;
  captures_chargeback: boolean;
  requires_cash_collector: boolean;
  captures_documents: boolean;
  print_signature: boolean;
  tone: ToneKey;
  display: 'Y' | 'N';
  updated_at: string | null;
}

/** What each stage asks the approver for, as chips. */
function asksFor(r: Row): string[] {
  return [
    r.captures_chargeback && 'Chargeback',
    r.requires_cash_collector && 'Cash Collector',
    r.captures_documents && 'Documents 3 & 4',
  ].filter((v): v is string => !!v);
}

export default function PaymentStagesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<Row[]>('/api/v1/payment-stages');
    setLoading(false);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not loaded', message: res.message });
      return;
    }
    setRows(res.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ListOrdered className="h-6 w-6 text-primary-600" /> Payment Stages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The approval chain every Payment Request passes through, in order. Who may act on each stage is set under
          Mapping → Role Payment Stage Mapping.
        </p>
      </div>

      <DataTable<Row>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Approval Chain"
        searchPlaceholder="Search stage, status, payment type..."
        emptyMessage="No stages configured — run the database migrations to seed the approval chain."
        columns={[
          { key: 'sort_order', header: 'Order', align: 'center', sortable: true, className: 'tabular-nums' },
          { key: 'label', header: 'Stage', sortable: true, className: 'font-medium' },
          {
            key: 'pending_label',
            header: 'Waiting Status',
            render: (r) => (
              <StatusBadge status={r.pending_label} tone={r.tone} />
            ),
          },
          {
            key: 'payment_type',
            header: 'Applies To',
            value: (r) => r.payment_type ?? 'All payments',
            render: (r) => r.payment_type ? `${r.payment_type} only` : 'All payments',
          },
          {
            key: 'asks',
            header: 'Asks Approver For',
            value: (r) => asksFor(r).join(', '),
            render: (r) =>
              asksFor(r).length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {asksFor(r).map((a) => (
                    <span key={a} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">{a}</span>
                  ))}
                </span>
              ),
          },
          {
            key: 'print_signature',
            header: 'Signs Print',
            align: 'center',
            value: (r) => (r.print_signature ? 'Yes' : 'No'),
          },
          {
            key: 'display',
            header: 'Active',
            align: 'center',
            value: (r) => displayLabel(r.display),
            render: (r) => <StatusBadge status={displayLabel(r.display)} />,
          },
          {
            key: 'updated_at',
            header: 'Updated',
            render: (r) => formatDateTime(r.updated_at, '—'),
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r) })}
      />

      {editing && (
        <StageModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(label) => {
            setEditing(null);
            void load();
            setResult({ status: 'success', title: 'Saved', message: `The ${label} stage has been saved. It applies from the next approval on.` });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

const TYPE_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'Bank', label: 'Bank only' },
  { value: 'Cash', label: 'Cash only' },
];

function StageModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (label: string) => void }) {
  const [form, setForm] = useState(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Row>(k: K, v: Row[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const res = await safeFetchJson<Row>(`/api/v1/payment-stages/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: form.label,
        pending_label: form.pending_label,
        sort_order: form.sort_order,
        payment_type: form.payment_type,
        captures_chargeback: form.captures_chargeback,
        requires_cash_collector: form.requires_cash_collector,
        captures_documents: form.captures_documents,
        print_signature: form.print_signature,
        tone: form.tone,
        display: form.display,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      setFieldErrors(
        Object.fromEntries(Object.entries(res.fieldMessages ?? {}).map(([k, v]) => [k, v[0] ?? ''])),
      );
      return;
    }
    onSaved(form.label);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={(e) => void submit(e)} className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">
            Edit Stage — <span className="font-mono text-sm text-muted-foreground">{row.stage}</span>
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div>
            <label htmlFor="st-label" className="label required">Stage Name</label>
            <input id="st-label" className="input" required maxLength={60} value={form.label}
              aria-invalid={fieldErrors.label ? true : undefined}
              onChange={(e) => set('label', e.target.value)} />
            {fieldErrors.label && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.label}</p>}
          </div>
          <div>
            <label htmlFor="st-pending" className="label required">Waiting Status</label>
            <input id="st-pending" className="input" required maxLength={60} value={form.pending_label}
              aria-invalid={fieldErrors.pending_label ? true : undefined}
              onChange={(e) => set('pending_label', e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">What a request waiting on this stage shows.</p>
          </div>
          <div>
            <label htmlFor="st-order" className="label required">Order</label>
            <input id="st-order" type="number" min={1} max={999} className="input" required value={form.sort_order}
              aria-invalid={fieldErrors.sort_order ? true : undefined}
              onChange={(e) => set('sort_order', Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">Lower runs first.</p>
          </div>
          <div>
            <label className="label">Applies To</label>
            <SearchableSelect
              value={form.payment_type ?? ''}
              onChange={(v) => set('payment_type', v === 'Bank' || v === 'Cash' ? v : null)}
              options={TYPE_OPTIONS}
              aria-label="Applies to"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Badge Colour</label>
            <div className="flex items-center gap-3">
              <SearchableSelect
                className="max-w-xs flex-1"
                value={form.tone}
                onChange={(v) => set('tone', v as ToneKey)}
                options={PAYMENT_STAGE_TONES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
                aria-label="Badge colour"
              />
              <StatusBadge status={form.pending_label || 'Preview'} tone={form.tone} />
            </div>
          </div>

          <div className="space-y-3 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The approver is asked for</p>
            <Toggle checked={form.captures_chargeback} onChange={(v) => set('captures_chargeback', v)} label="Chargeback amount" />
            <Toggle checked={form.requires_cash_collector} onChange={(v) => set('requires_cash_collector', v)} label="Cash Collector (required)" />
            <Toggle checked={form.captures_documents} onChange={(v) => set('captures_documents', v)} label="Documents 3 & 4 (proof of payment)" />
            <Toggle checked={form.print_signature} onChange={(v) => set('print_signature', v)} label="Signature cell on the printed Demande de Fonds" />
            <Toggle checked={form.display === 'Y'} onChange={(v) => set('display', v ? 'Y' : 'N')} label="Active — requests pass through this stage" />
            {fieldErrors.display && <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.display}</p>}
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* §4.21 — a labelled way out. */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
