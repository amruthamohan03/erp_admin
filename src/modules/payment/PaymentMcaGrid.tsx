'use client';

// §2 step 6 — MCA reference grid for a Payment Request. Renders BELOW the
// transaction-pages header on /payments/[id]. References are split lines
// ({mca_ref, amount}); each is validated against the client's tracking table
// (imports/exports/locals per pay_for) and against other requests with the same
// expense type. On save the header Amount is set to the references total.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { safeFetchJson } from '@/lib/safeFetch';

const PAY_FOR = ['Import', 'Export', 'Local', 'Other', 'Pre Payment'];

interface Line {
  mca_ref: string;
  amount: number;
  exists?: boolean;
  duplicate?: number | null;
  valid?: boolean;
}

interface GridData {
  header: {
    id: number;
    client_id: number | null;
    pay_for: number | null;
    expense_type: number | null;
    amount: number;
    editable: boolean;
  };
  refs: { mca_ref: string; amount: number }[];
  availableRefs: { mca_ref: string }[];
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number): number => Math.round(n * 100) / 100;

export default function PaymentMcaGrid({ paymentId }: { paymentId: number }) {
  const base = `/api/v1/payments/${paymentId}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GridData | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [addRef, setAddRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await safeFetchJson<GridData>(`${base}/mca`);
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setData(res.data);
    setLines(res.data.refs.map((r) => ({ ...r })));
    setLoading(false);
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isInteger(paymentId) && paymentId > 0) void load();
  }, [load, paymentId]);

  const readonly = !(data?.header.editable ?? false);
  const total = useMemo(() => round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)), [lines]);
  const headerAmount = data?.header.amount ?? 0;
  const matches = Math.abs(total - headerAmount) < 0.01;

  const pickerOptions = useMemo(() => {
    const used = new Set(lines.map((l) => l.mca_ref.toUpperCase()));
    return (data?.availableRefs ?? [])
      .filter((r) => !used.has(r.mca_ref.toUpperCase()))
      .map((r) => ({ value: r.mca_ref, label: r.mca_ref }));
  }, [data, lines]);

  const patch = useCallback((idx: number, p: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...p, valid: undefined, exists: undefined, duplicate: undefined } : l)));
  }, []);

  const addBlank = useCallback(() => setLines((prev) => [...prev, { mca_ref: '', amount: 0 }]), []);
  const addFromPicker = useCallback(() => {
    if (!addRef) return;
    setLines((prev) => [...prev, { mca_ref: addRef, amount: 0 }]);
    setAddRef('');
  }, [addRef]);
  const remove = useCallback((idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx)), []);

  const validateAll = useCallback(async () => {
    if (!data) return;
    setValidating(true);
    setNotice(null);
    const res = await safeFetchJson<Line[]>('/api/v1/payments/mca-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refs: lines.map((l) => l.mca_ref).filter(Boolean),
        pay_for: data.header.pay_for,
        client_id: data.header.client_id,
        expense_type: data.header.expense_type,
        payment_id: paymentId,
      }),
    });
    setValidating(false);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    const byRef = new Map(res.data.map((v) => [v.mca_ref.toUpperCase(), v]));
    setLines((prev) =>
      prev.map((l) => {
        const v = byRef.get(l.mca_ref.toUpperCase());
        return v ? { ...l, exists: v.exists, duplicate: v.duplicate, valid: v.valid } : l;
      }),
    );
    const invalid = res.data.filter((v) => !v.valid).length;
    setNotice(invalid === 0 ? 'All references are valid.' : `${invalid} reference(s) need attention.`);
  }, [data, lines, paymentId]);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    const res = await safeFetchJson<{ total: number; count: number }>(`${base}/mca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refs: lines.map((l) => ({ mca_ref: l.mca_ref, amount: l.amount })) }),
    });
    setSaving(false);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setNotice(`Saved ${res.data.count} reference(s). Header amount set to ${money(res.data.total)}.`);
    void load();
  }, [base, lines, load]);

  if (loading) return <div className="card mt-6 p-6 text-center text-muted-foreground">Loading references…</div>;
  if (error) {
    return (
      <div className="card mt-6 p-4 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
        References unavailable: {error}
      </div>
    );
  }
  if (!data) return null;

  const payForLabel = data.header.pay_for != null ? PAY_FOR[data.header.pay_for] ?? '—' : '—';
  const skipsTracking = data.header.pay_for === 3 || data.header.pay_for === 4;

  return (
    <div className="mt-6 space-y-4">
      {readonly && (
        <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          This request is in the approval chain and its references are read-only.
        </div>
      )}
      {notice && <div className="rounded-md border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-300">{notice}</div>}

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">MCA References</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Payment for <span className="font-medium">{payForLabel}</span>
              {skipsTracking && ' — references are auto-generated and not checked against a tracking table.'}
            </p>
          </div>
          {!readonly && (
            <div className="flex items-center gap-2">
              {!skipsTracking && (
                <div className="w-64">
                  <SearchableSelect value={addRef} onChange={setAddRef} options={pickerOptions} placeholder="Pick client reference…" />
                </div>
              )}
              {!skipsTracking && (
                <button type="button" onClick={addFromPicker} disabled={!addRef} className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add
                </button>
              )}
              <button type="button" onClick={addBlank} className="btn-secondary inline-flex items-center gap-1">
                <Plus className="h-4 w-4" /> Row
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                {!readonly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={readonly ? 4 : 5} className="py-4 text-center text-muted-foreground">
                    No references. Add a row or pick from the client&apos;s references.
                  </td>
                </tr>
              )}
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="text-muted-foreground">{idx + 1}</td>
                  <td>
                    <input
                      value={l.mca_ref}
                      disabled={readonly}
                      onChange={(e) => patch(idx, { mca_ref: e.target.value })}
                      className="input min-w-[14rem] font-mono text-xs"
                      placeholder="MCA reference"
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={l.amount}
                      disabled={readonly}
                      onChange={(e) => patch(idx, { amount: Number(e.target.value) })}
                      className="input w-32 text-right"
                    />
                  </td>
                  <td>
                    {l.valid === undefined ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : l.valid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {!l.exists ? 'Not found' : `Used by #${l.duplicate}`}
                      </span>
                    )}
                  </td>
                  {!readonly && (
                    <td>
                      <button type="button" onClick={() => remove(idx)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={2} className="text-right">
                  References total
                </td>
                <td className="text-right tabular-nums">{money(total)}</td>
                <td colSpan={readonly ? 1 : 2}>
                  <span className={`text-xs ${matches ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {matches ? 'matches header amount' : `header amount ${money(headerAmount)} — will be updated on save`}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!readonly && (
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={validateAll} disabled={validating || lines.length === 0}
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Validate references
            </button>
            <button type="button" onClick={save} disabled={saving}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save references
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
