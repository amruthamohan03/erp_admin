'use client';

// §5 PARTIELLE Management modal — opened from the gear button on the import
// form's "Inspection Reports (PARTIELLE)" field. Shows the licence weight/FOB
// budget and remaining (available) budget, lets the operator create allotments,
// and lists every allotment with its usage (files, weight/FOB used, remaining).
// Ports the legacy "PARTIELLE Management" dialog. On any change it calls
// onChanged so the picker's dropdown refreshes.
import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Save, Loader2, Layers } from 'lucide-react';

interface Row {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  weight_used: number;
  fob_used: number;
  no_of_files: number;
  remaining_weight: number;
  remaining_fob: number;
}
interface Summary {
  license: { license_number: string; license_weight: number; license_fob: number; client_name: string; ref_cod: string };
  available: { weight: number; fob: number };
  rows: Row[];
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PartielleManageModal({
  licenseId,
  onClose,
  onChanged,
}: {
  licenseId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', weight: '', fob: '' });
  const [edit, setEdit] = useState<{ id: number; weight: string; fob: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(`/api/v1/partielles/summary?license_id=${licenseId}`).then((r) => r.json());
      if (j.ok) setData(j.data);
      else setError(j.error?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [licenseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const j = await fetch('/api/v1/partielles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partial_name: form.name.trim(),
          license_id: licenseId,
          partial_weight: Number(form.weight) || 0,
          partial_fob: Number(form.fob) || 0,
        }),
      }).then((r) => r.json());
      if (!j.ok) {
        setError(j.error?.message ?? 'Create failed');
        return;
      }
      setForm({ name: '', weight: '', fob: '' });
      setShowCreate(false);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const j = await fetch(`/api/v1/partielles/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_weight: Number(edit.weight) || 0, partial_fob: Number(edit.fob) || 0 }),
      }).then((r) => r.json());
      if (!j.ok) {
        setError(j.error?.message ?? 'Save failed');
        return;
      }
      setEdit(null);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const lic = data?.license;
  const nextRef = `${lic?.ref_cod || ''}-${String((data?.rows.length ?? 0) + 1).padStart(4, '0')}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-2 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-5xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-emerald-500 to-green-600">
          <h2 className="font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5" /> PARTIELLE Management{lic ? ` — ${lic.license_number} (${lic.client_name})` : ''}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {loading && <div className="py-8 text-center text-slate-500">Loading…</div>}

          {!loading && lic && (
            <>
              {/* Budget + available boxes */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 space-y-0.5">
                  <div><span className="font-semibold">Client:</span> {lic.client_name || '—'}</div>
                  <div><span className="font-semibold">REF COD:</span> {lic.ref_cod || '—'}</div>
                  <div><span className="font-semibold">License Weight:</span> {money(lic.license_weight)} KG</div>
                  <div><span className="font-semibold">License FOB:</span> {money(lic.license_fob)}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex flex-col justify-center gap-1">
                  <div className="font-semibold">Available Weight: <span className={data.available.weight < 0 ? 'text-red-600' : ''}>{money(data.available.weight)} KG</span></div>
                  <div className="font-semibold">Available FOB: <span className={data.available.fob < 0 ? 'text-red-600' : ''}>{money(data.available.fob)}</span></div>
                </div>
              </div>

              {/* Add new */}
              {!showCreate ? (
                <button type="button" onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-sm font-medium">
                  <Plus className="h-4 w-4" /> Add New PARTIELLE
                </button>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label">PARTIELLE Number</label>
                    <input className="input w-48" value={form.name} placeholder={nextRef}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Partial Weight (KG)</label>
                    <input type="number" step="0.001" className="input w-36" value={form.weight}
                      onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Partial FOB</label>
                    <input type="number" step="0.01" className="input w-36" value={form.fob}
                      onChange={(e) => setForm((f) => ({ ...f, fob: e.target.value }))} />
                  </div>
                  <button type="button" onClick={create} disabled={busy || !form.name.trim()}
                    className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                </div>
              )}

              {/* Allotment table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="table-base whitespace-nowrap text-xs">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>REF COD</th>
                      <th>PARTIELLE Number</th>
                      <th className="text-right">License Weight</th>
                      <th className="text-right">License FOB</th>
                      <th className="text-center">No of Files</th>
                      <th className="text-right">Partial Weight</th>
                      <th className="text-right">Partial FOB</th>
                      <th className="text-right">Weight Used</th>
                      <th className="text-right">FOB Used</th>
                      <th className="text-right">Rem. Weight</th>
                      <th className="text-right">Rem. FOB</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr><td colSpan={13} className="text-center text-slate-500 py-6">No allotments yet.</td></tr>
                    )}
                    {data.rows.map((r, idx) => {
                      const editing = edit?.id === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="text-slate-400">{idx + 1}</td>
                          <td>{lic.ref_cod}</td>
                          <td className="font-mono">{r.partial_name}</td>
                          <td className="text-right tabular-nums">{money(lic.license_weight)}</td>
                          <td className="text-right tabular-nums">{money(lic.license_fob)}</td>
                          <td className="text-center"><span className="inline-flex items-center justify-center min-w-[22px] h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-semibold px-1.5">{r.no_of_files}</span></td>
                          <td className="text-right">
                            {editing ? (
                              <input type="number" step="0.001" className="input w-24 text-right py-1" value={edit.weight}
                                onChange={(e) => setEdit({ ...edit, weight: e.target.value })} />
                            ) : money(r.partial_weight)}
                          </td>
                          <td className="text-right">
                            {editing ? (
                              <input type="number" step="0.01" className="input w-24 text-right py-1" value={edit.fob}
                                onChange={(e) => setEdit({ ...edit, fob: e.target.value })} />
                            ) : money(r.partial_fob)}
                          </td>
                          <td className="text-right text-slate-600 tabular-nums">{money(r.weight_used)}</td>
                          <td className="text-right text-slate-600 tabular-nums">{money(r.fob_used)}</td>
                          <td className={`text-right tabular-nums font-medium ${r.remaining_weight < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(r.remaining_weight)}</td>
                          <td className={`text-right tabular-nums font-medium ${r.remaining_fob < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(r.remaining_fob)}</td>
                          <td className="text-center">
                            {editing ? (
                              <button type="button" onClick={saveEdit} disabled={busy}
                                className="inline-flex items-center gap-1 rounded bg-primary-600 hover:bg-primary-700 text-white px-2 h-7 text-[11px]">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                              </button>
                            ) : (
                              <button type="button" onClick={() => setEdit({ id: r.id, weight: String(r.partial_weight), fob: String(r.partial_fob) })}
                                className="text-primary-600 hover:text-primary-800 text-xs font-medium">Resize</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary inline-flex items-center gap-1.5"><X className="h-4 w-4" /> Close</button>
        </div>
      </div>
    </div>
  );
}
