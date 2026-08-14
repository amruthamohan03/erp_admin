'use client';

// §5 PARTIELLE management — cut a licence's weight/FOB budget into named
// allotments and watch remaining capacity. Imports link to an allotment by its
// name (imports_t.inspection_reports); saving an over-drawing import is rejected
// server-side (C-02). Negative remaining shows red — an allotment that is
// already over-consumed.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Save, Loader2, Layers, ArrowLeft, PieChart } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { safeFetchJson } from '@/lib/safeFetch';

interface Row {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  weight_used: number;
  fob_used: number;
  remaining_weight: number;
  remaining_fob: number;
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PartiellesPage() {
  const [licenseOpts, setLicenseOpts] = useState<{ value: string; label: string }[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ partial_name: '', partial_weight: '', partial_fob: '' });
  const [edit, setEdit] = useState<{ id: number; weight: string; fob: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await safeFetchJson<Array<{ id: number; license_number: string | null }>>(
        '/api/v1/licenses?pageSize=100',
      );
      if (!cancelled && res.ok) {
        setLicenseOpts(res.data.map((l) => ({ value: String(l.id), label: l.license_number ?? `#${l.id}` })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!licenseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const res = await safeFetchJson<Row[]>(`/api/v1/partielles?license_id=${licenseId}`);
    setLoading(false);
    if (res.ok) setRows(res.data);
    else setNotice(res.message);
  }, [licenseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const w = rows.reduce((s, r) => s + r.partial_weight, 0);
    const f = rows.reduce((s, r) => s + r.partial_fob, 0);
    const wu = rows.reduce((s, r) => s + r.weight_used, 0);
    const fu = rows.reduce((s, r) => s + r.fob_used, 0);
    return { w, f, wu, fu };
  }, [rows]);

  const create = useCallback(async () => {
    if (!licenseId || !form.partial_name.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await safeFetchJson<{ id: number }>('/api/v1/partielles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partial_name: form.partial_name.trim(),
        license_id: Number(licenseId),
        partial_weight: Number(form.partial_weight) || 0,
        partial_fob: Number(form.partial_fob) || 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setForm({ partial_name: '', partial_weight: '', partial_fob: '' });
    setNotice('Allotment created.');
    void load();
  }, [licenseId, form, load]);

  const saveEdit = useCallback(async () => {
    if (!edit) return;
    setBusy(true);
    setNotice(null);
    const res = await safeFetchJson<{ id: number }>(`/api/v1/partielles/${edit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partial_weight: Number(edit.weight) || 0, partial_fob: Number(edit.fob) || 0 }),
    });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setEdit(null);
    void load();
  }, [edit, load]);

  return (
    <>
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary-600" /> PARTIELLE Allocation
        </h1>
        <Link href="/imports" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to Imports
        </Link>
      </div>

      {notice && <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 mb-4">{notice}</div>}

      <div className="card p-4 mb-4">
        <label className="label">Licence</label>
        <div className="max-w-md">
          <SearchableSelect value={licenseId} onChange={setLicenseId} options={licenseOpts} placeholder="Select a licence…" />
        </div>
      </div>

      {licenseId && (
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-slate-800">Allotments</span>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Name</th>
                  <th className="text-right">Weight (KG)</th>
                  <th className="text-right">Weight Used</th>
                  <th className="text-right">Weight Remaining</th>
                  <th className="text-right">FOB</th>
                  <th className="text-right">FOB Used</th>
                  <th className="text-right">FOB Remaining</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">No allotments for this licence yet.</td></tr>
                )}
                {!loading && rows.map((r, idx) => {
                  const editing = edit?.id === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="text-muted-foreground">{idx + 1}</td>
                      <td className="font-mono text-xs">{r.partial_name}</td>
                      <td className="text-right">
                        {editing ? (
                          <input type="number" step="0.001" value={edit.weight}
                            onChange={(e) => setEdit({ ...edit, weight: e.target.value })} className="input w-28 text-right" />
                        ) : money(r.partial_weight)}
                      </td>
                      <td className="text-right text-slate-600">{money(r.weight_used)}</td>
                      <td className={`text-right font-medium tabular-nums ${r.remaining_weight < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {money(r.remaining_weight)}
                      </td>
                      <td className="text-right">
                        {editing ? (
                          <input type="number" step="0.01" value={edit.fob}
                            onChange={(e) => setEdit({ ...edit, fob: e.target.value })} className="input w-28 text-right" />
                        ) : money(r.partial_fob)}
                      </td>
                      <td className="text-right text-slate-600">{money(r.fob_used)}</td>
                      <td className={`text-right font-medium tabular-nums ${r.remaining_fob < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {money(r.remaining_fob)}
                      </td>
                      <td className="text-center">
                        {editing ? (
                          <button type="button" onClick={saveEdit} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-2 h-7 text-[11px]">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </button>
                        ) : (
                          <button type="button"
                            onClick={() => setEdit({ id: r.id, weight: String(r.partial_weight), fob: String(r.partial_fob) })}
                            className="text-primary-600 hover:text-primary-800 text-xs font-medium">Resize</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td colSpan={2} className="text-right">Totals</td>
                    <td className="text-right tabular-nums">{money(totals.w)}</td>
                    <td className="text-right tabular-nums">{money(totals.wu)}</td>
                    <td></td>
                    <td className="text-right tabular-nums">{money(totals.f)}</td>
                    <td className="text-right tabular-nums">{money(totals.fu)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Create allotment */}
          <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Allotment Name</label>
              <input className="input w-56" placeholder="e.g. CRF123-0001" value={form.partial_name}
                onChange={(e) => setForm((f) => ({ ...f, partial_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Weight (KG)</label>
              <input type="number" step="0.001" className="input w-32" value={form.partial_weight}
                onChange={(e) => setForm((f) => ({ ...f, partial_weight: e.target.value }))} />
            </div>
            <div>
              <label className="label">FOB</label>
              <input type="number" step="0.01" className="input w-32" value={form.partial_fob}
                onChange={(e) => setForm((f) => ({ ...f, partial_fob: e.target.value }))} />
            </div>
            <button type="button" onClick={create} disabled={busy || !form.partial_name.trim()}
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Allotment
            </button>
          </div>
        </div>
      )}
    </>
  );
}
