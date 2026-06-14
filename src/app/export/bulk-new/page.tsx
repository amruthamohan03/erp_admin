'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Layers, Save, ArrowRight, Shield, Search, X, Check } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';

interface Option { id: number; label: string }

interface Usage {
  transport_mode_id: number | null;
  license_weight: number;
  license_fob: number;
  used_weight: number;
  used_fob: number;
  available_weight: number;
  available_fob: number;
}

interface GridRow {
  loading_date: string;
  bp_date: string;
  site_of_loading_id: string;
  destination: string;
  horse: string;
  trailer_1: string;
  trailer_2: string;
  wagon_ref: string;
  feet_container: string;
  container: string;
  transporter: string;
  exit_point_id: string;
  weight: string;
  fob: string;
  number_of_bags: string;
  lot_number: string;
  dgda_seal_no: string;
  number_of_seals: string;
}

function emptyRow(defaultFeet: string): GridRow {
  return {
    loading_date: '', bp_date: '', site_of_loading_id: '', destination: '',
    horse: '', trailer_1: '', trailer_2: '', wagon_ref: '', feet_container: defaultFeet,
    container: '', transporter: '', exit_point_id: '', weight: '', fob: '',
    number_of_bags: '', lot_number: '', dgda_seal_no: '', number_of_seals: '',
  };
}

async function fetchOptions(url: string, labelKey: string): Promise<Option[]> {
  try {
    const r = await fetch(url);
    const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : [];
    return list.map((row: Record<string, unknown>) => ({ id: row.id as number, label: String(row[labelKey] ?? row.id) }));
  } catch {
    return [];
  }
}

export default function BulkCreateExportsPage() {
  const router = useRouter();

  const [clientOpts, setClientOpts] = useState<Option[]>([]);
  const [licenseOpts, setLicenseOpts] = useState<Option[]>([]);
  const [regimeOpts, setRegimeOpts] = useState<Option[]>([]);
  const [clearanceOpts, setClearanceOpts] = useState<Option[]>([]);
  const [siteOpts, setSiteOpts] = useState<Option[]>([]);
  const [exitOpts, setExitOpts] = useState<Option[]>([]);
  const [feetOpts, setFeetOpts] = useState<Option[]>([]);

  const [clientId, setClientId] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [regime, setRegime] = useState('');
  const [clearance, setClearance] = useState('');
  const [bpNo, setBpNo] = useState('');

  const [usage, setUsage] = useState<Usage | null>(null);
  const [numEntries, setNumEntries] = useState(1);
  const [rows, setRows] = useState<GridRow[]>([]);

  // §legacy — DGDA seal picker (Road only). Pulls Available seals; the chosen seal
  // numbers fill dgda_seal_no and number_of_seals auto-counts.
  const [availableSeals, setAvailableSeals] = useState<{ id: number; seal_number: string }[]>([]);
  const [sealRow, setSealRow] = useState<number | null>(null);
  const [sealSearch, setSealSearch] = useState('');
  const [sealChecked, setSealChecked] = useState<Set<string>>(new Set());
  const [sealLoading, setSealLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [c, cl, s, e, fc] = await Promise.all([
        fetchOptions('/api/clients?pageSize=1000', 'short_name'),
        fetchOptions('/api/clearances?pageSize=1000', 'clearance_name'),
        fetchOptions('/api/transit-points?pageSize=1000', 'transit_point_name'),
        fetchOptions('/api/transit-points?pageSize=1000', 'transit_point_name'),
        fetchOptions('/api/feet-containers?pageSize=1000', 'feet_container_size'),
      ]);
      setClientOpts(c); setClearanceOpts(cl);
      setSiteOpts(s); setExitOpts(e); setFeetOpts(fc);
    })();
  }, []);

  // Load licenses when client changes.
  useEffect(() => {
    setLicenseId(''); setUsage(null); setLicenseOpts([]);
    if (!clientId) return;
    fetchOptions(`/api/licenses?client_id=${clientId}&pageSize=1000`, 'license_number').then(setLicenseOpts);
  }, [clientId]);

  // §4.5 — Regime options depend on the client's trade direction (client_type).
  useEffect(() => {
    setRegime('');
    const url = clientId ? `/api/regimes?client_id=${clientId}&pageSize=1000` : '/api/regimes?pageSize=1000';
    fetchOptions(url, 'regime_name').then(setRegimeOpts);
  }, [clientId]);

  // Load usage when license changes.
  useEffect(() => {
    setUsage(null);
    if (!licenseId) return;
    (async () => {
      try {
        const r = await fetch(`/api/exports/license-usage?license_id=${licenseId}`);
        const j = await r.json();
        if (j.success) setUsage(j.data);
      } catch { /* ignore */ }
    })();
  }, [licenseId]);

  const defaultFeet = useMemo(() => {
    const five = feetOpts.find((o) => o.id === 5);
    return five ? '5' : '';
  }, [feetOpts]);

  const transportModeId = usage?.transport_mode_id ?? null;
  const isRoad = transportModeId === 1;
  const isWagon = transportModeId === 2 || transportModeId === 3;

  const totals = useMemo(() => {
    let w = 0; let f = 0;
    for (const r of rows) {
      w += Math.abs(parseFloat(r.weight) || 0);
      f += Math.abs(parseFloat(r.fob) || 0);
    }
    return { w, f };
  }, [rows]);

  const remainingWeight = (usage?.available_weight ?? 0) - totals.w;
  const remainingFob = (usage?.available_fob ?? 0) - totals.f;

  function generateRows() {
    setErr(null); setMsg(null);
    if (!clientId || !licenseId || !regime || !clearance) {
      setErr('Client, License, Regime and Types of Clearance are required before generating rows.');
      return;
    }
    const n = Math.max(1, Math.min(3000, numEntries));
    setRows(Array.from({ length: n }, () => emptyRow(defaultFeet)));
  }

  function updateRow(i: number, key: keyof GridRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Seal picker: union of Available seals + whatever this row already holds, filtered.
  const sealOptions = useMemo(() => {
    const names = new Set(availableSeals.map((s) => s.seal_number));
    sealChecked.forEach((c) => names.add(c));
    const q = sealSearch.trim().toLowerCase();
    return [...names].filter((nm) => !q || nm.toLowerCase().includes(q)).sort();
  }, [availableSeals, sealChecked, sealSearch]);

  function openSeal(i: number) {
    const current = new Set((rows[i]?.dgda_seal_no || '').split(',').map((s) => s.trim()).filter(Boolean));
    setSealChecked(current);
    setSealSearch('');
    setSealRow(i);
    setSealLoading(true);
    fetch('/api/seal-numbers/available?limit=1000')
      .then((r) => r.json())
      .then((j) => { if (j.success) setAvailableSeals(j.data.seals.map((s: { id: number; seal_number: string }) => ({ id: s.id, seal_number: s.seal_number }))); })
      .catch(() => {})
      .finally(() => setSealLoading(false));
  }
  function toggleSeal(name: string) {
    setSealChecked((prev) => { const x = new Set(prev); if (x.has(name)) x.delete(name); else x.add(name); return x; });
  }
  function confirmSeals() {
    if (sealRow === null) return;
    const picked = [...sealChecked];
    setRows((prev) => prev.map((r, idx) => (idx === sealRow ? { ...r, dgda_seal_no: picked.join(', '), number_of_seals: String(picked.length) } : r)));
    setSealRow(null);
  }

  async function save() {
    setErr(null); setMsg(null);
    if (rows.length === 0) { setErr('Generate at least one row first.'); return; }
    if (!rows.some((r) => (parseFloat(r.weight) || 0) > 0)) {
      setErr('At least one entry must have weight > 0.'); return;
    }
    if (remainingWeight < 0) { setErr('Total weight exceeds the license limit.'); return; }
    if (remainingFob < 0) { setErr('Total FOB exceeds the license limit.'); return; }

    const num = (v: string): number | null => (v === '' ? null : Number(v));
    const txt = (v: string): string | null => (v.trim() === '' ? null : v.trim());

    const payload = {
      common: {
        client_id: Number(clientId),
        license_id: Number(licenseId),
        regime: Number(regime),
        types_of_clearance: Number(clearance),
        bp_no: txt(bpNo),
      },
      rows: rows.map((r) => ({
        loading_date: r.loading_date || null,
        bp_date: r.bp_date || null,
        site_of_loading_id: num(r.site_of_loading_id),
        destination: txt(r.destination),
        horse: isRoad ? txt(r.horse) : null,
        trailer_1: isRoad ? txt(r.trailer_1) : null,
        trailer_2: isRoad ? txt(r.trailer_2) : null,
        wagon_ref: isWagon ? txt(r.wagon_ref) : null,
        feet_container: num(r.feet_container),
        container: txt(r.container),
        transporter: txt(r.transporter),
        exit_point_id: num(r.exit_point_id),
        weight: Math.abs(parseFloat(r.weight) || 0),
        fob: Math.abs(parseFloat(r.fob) || 0),
        number_of_bags: num(r.number_of_bags),
        lot_number: txt(r.lot_number),
        dgda_seal_no: txt(r.dgda_seal_no),
        number_of_seals: num(r.number_of_seals),
      })),
    };

    setSaving(true);
    try {
      const res = await fetch('/api/exports/bulk-insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErr(json.message || 'Bulk create failed.');
      } else {
        setMsg(`Created ${json.data.created} export(s).`);
        setTimeout(() => router.push('/export'), 1200);
      }
    } catch {
      setErr('Bulk create failed.');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton fallback="/export" /></div>

      <div className="card p-4 mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-amber-600" />
        <h1 className="text-xl font-bold text-slate-900">Bulk Create Exports</h1>
        <span className="text-sm text-slate-500">— many entries against one license</span>
      </div>

      {/* Common header */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <div>
            <label className="label">Client <span className="text-red-500">*</span></label>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">-- Select --</option>
              {clientOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">License Number <span className="text-red-500">*</span></label>
            <select className="input" value={licenseId} onChange={(e) => setLicenseId(e.target.value)} disabled={!clientId}>
              <option value="">{clientId ? '-- Select --' : 'Select client first'}</option>
              {licenseOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Regime <span className="text-red-500">*</span></label>
            <select className="input" value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="">-- Select --</option>
              {regimeOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Types of Clearance <span className="text-red-500">*</span></label>
            <select className="input" value={clearance} onChange={(e) => setClearance(e.target.value)}>
              <option value="">-- Select --</option>
              {clearanceOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">BP Number</label>
            <input className="input" value={bpNo} onChange={(e) => setBpNo(e.target.value)} />
          </div>
        </div>

        {usage && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500 text-xs">License Weight / FOB</div>
              <div className="font-semibold">{fmt(usage.license_weight, 3)} MT / {fmt(usage.license_fob)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500 text-xs">Used (existing)</div>
              <div className="font-semibold">{fmt(usage.used_weight, 3)} MT / {fmt(usage.used_fob)}</div>
            </div>
            <div className={`rounded-lg border p-2 ${remainingWeight < 0 || remainingFob < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="text-slate-500 text-xs">Remaining after this batch</div>
              <div className="font-semibold">{fmt(remainingWeight, 3)} MT / {fmt(remainingFob)}</div>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Number of Entries</label>
            <input type="number" min={1} max={3000} className="input w-32" value={numEntries}
              onChange={(e) => setNumEntries(parseInt(e.target.value, 10) || 1)} />
          </div>
          <button type="button" onClick={generateRows} className="btn-primary inline-flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4" /> Proceed to Create Exports
          </button>
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
        {msg && <div className="mt-3 text-sm text-emerald-700">{msg}</div>}
      </div>

      {/* Grid */}
      {rows.length > 0 && (
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-800">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
            <button type="button" onClick={save} disabled={saving}
              className="btn-primary inline-flex items-center gap-1.5">
              <Save className="h-4 w-4" /> {saving ? 'Creating...' : 'Create All Exports'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Loading Date</th>
                  <th>BP Date</th>
                  <th>Site of Loading</th>
                  <th>Destination</th>
                  {isRoad && (<><th>Horse</th><th>Trailer 1</th><th>Trailer 2</th></>)}
                  {isWagon && (<th>{transportModeId === 2 ? 'Airway Bill' : 'Wagon Ref'}</th>)}
                  <th>Feet Container</th>
                  <th>Container</th>
                  <th>Transporter</th>
                  <th>Exit Point</th>
                  <th>Weight (MT) *</th>
                  <th>FOB</th>
                  <th>No. of Bags</th>
                  <th>Lot Number</th>
                  <th>DGDA Seal No</th>
                  <th>No. of Seals</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-slate-500 font-medium text-center">{i + 1}</td>
                    <td><input type="date" className="input py-1 text-xs min-w-[130px]" value={r.loading_date} onChange={(e) => updateRow(i, 'loading_date', e.target.value)} /></td>
                    <td><input type="date" className="input py-1 text-xs min-w-[130px]" value={r.bp_date} onChange={(e) => updateRow(i, 'bp_date', e.target.value)} /></td>
                    <td>
                      <select className="input py-1 text-xs min-w-[140px]" value={r.site_of_loading_id} onChange={(e) => updateRow(i, 'site_of_loading_id', e.target.value)}>
                        <option value="">--</option>
                        {siteOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                      </select>
                    </td>
                    <td><input className="input py-1 text-xs min-w-[120px]" value={r.destination} onChange={(e) => updateRow(i, 'destination', e.target.value)} /></td>
                    {isRoad && (<>
                      <td><input className="input py-1 text-xs min-w-[100px]" value={r.horse} onChange={(e) => updateRow(i, 'horse', e.target.value)} /></td>
                      <td><input className="input py-1 text-xs min-w-[100px]" value={r.trailer_1} onChange={(e) => updateRow(i, 'trailer_1', e.target.value)} /></td>
                      <td><input className="input py-1 text-xs min-w-[100px]" value={r.trailer_2} onChange={(e) => updateRow(i, 'trailer_2', e.target.value)} /></td>
                    </>)}
                    {isWagon && (<td><input className="input py-1 text-xs min-w-[120px]" value={r.wagon_ref} onChange={(e) => updateRow(i, 'wagon_ref', e.target.value)} /></td>)}
                    <td>
                      <select className="input py-1 text-xs min-w-[110px]" value={r.feet_container} onChange={(e) => updateRow(i, 'feet_container', e.target.value)}>
                        <option value="">--</option>
                        {feetOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                      </select>
                    </td>
                    <td><input className="input py-1 text-xs min-w-[100px]" value={r.container} onChange={(e) => updateRow(i, 'container', e.target.value)} /></td>
                    <td><input className="input py-1 text-xs min-w-[120px]" value={r.transporter} onChange={(e) => updateRow(i, 'transporter', e.target.value)} /></td>
                    <td>
                      <select className="input py-1 text-xs min-w-[130px]" value={r.exit_point_id} onChange={(e) => updateRow(i, 'exit_point_id', e.target.value)}>
                        <option value="">--</option>
                        {exitOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                      </select>
                    </td>
                    <td><input type="number" step="0.001" min="0" className="input py-1 text-xs min-w-[110px] text-right" value={r.weight} onChange={(e) => updateRow(i, 'weight', e.target.value)} /></td>
                    <td><input type="number" step="0.01" min="0" className="input py-1 text-xs min-w-[110px] text-right" value={r.fob} onChange={(e) => updateRow(i, 'fob', e.target.value)} /></td>
                    <td><input type="number" min="0" className="input py-1 text-xs min-w-[90px] text-right" value={r.number_of_bags} onChange={(e) => updateRow(i, 'number_of_bags', e.target.value)} /></td>
                    <td><input className="input py-1 text-xs min-w-[110px]" value={r.lot_number} onChange={(e) => updateRow(i, 'lot_number', e.target.value)} /></td>
                    <td>
                      {isRoad ? (
                        <div className="flex items-center gap-1 min-w-[180px]">
                          <input className="input py-1 text-xs flex-1" value={r.dgda_seal_no} readOnly placeholder="No seals selected" />
                          <button type="button" onClick={() => openSeal(i)} title="Select DGDA seals"
                            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <input className="input py-1 text-xs min-w-[140px]" value={r.dgda_seal_no} onChange={(e) => updateRow(i, 'dgda_seal_no', e.target.value)} />
                      )}
                    </td>
                    <td><input type="number" min="0" className={`input py-1 text-xs min-w-[90px] text-right${isRoad ? ' bg-slate-100' : ''}`} value={r.number_of_seals} onChange={(e) => updateRow(i, 'number_of_seals', e.target.value)} readOnly={isRoad} /></td>
                    <td className="text-center">
                      <button type="button" onClick={() => removeRow(i)} title="Remove row" className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
            <span className="text-slate-600">Total weight <strong>{fmt(totals.w, 3)} MT</strong> · Total FOB <strong>{fmt(totals.f)}</strong></span>
            <button type="button" onClick={() => setRows((p) => [...p, emptyRow(defaultFeet)])} className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <Plus className="h-4 w-4" /> Add row
            </button>
          </div>
        </div>
      )}

      {/* ---- DGDA seal picker (Road) ---- */}
      {sealRow !== null && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setSealRow(null)}>
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Shield className="h-5 w-5" /> Select DGDA Seals</h2>
              <button type="button" onClick={() => setSealRow(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input className="input pl-9" placeholder="Search seals..." value={sealSearch} onChange={(e) => setSealSearch(e.target.value)} />
              </div>
              <div className="text-xs text-slate-500 mb-2">{sealChecked.size} selected</div>
              <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {sealLoading && <div className="py-6 text-center text-sm text-slate-500">Loading…</div>}
                {!sealLoading && sealOptions.length === 0 && <div className="py-6 text-center text-sm text-slate-500">No available seals.</div>}
                {!sealLoading && sealOptions.map((s) => (
                  <label key={s} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={sealChecked.has(s)} onChange={() => toggleSeal(s)} />
                    <span className="font-mono">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setSealRow(null)} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
              <button type="button" onClick={confirmSeals} className="btn-primary"><Check className="h-4 w-4" /> Confirm Selection</button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
