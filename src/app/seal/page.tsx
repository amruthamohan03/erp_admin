'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield, Boxes, CheckCircle2, ShieldAlert, MapPin, Plus, Search, Edit2, Eye, Trash2,
  FileSpreadsheet, ListOrdered, X, Save, ChevronDown,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { safeFetchJson } from '@/lib/safeFetch';
import { SEAL_UNIT_PRICE } from '@/lib/seals/constants';
import type { SealMasterListRow, SealNumberListRow, SealStats, SealStatus } from '@/types';

interface Opt { id: number; label: string }
interface DashboardCard { id: number; card_content_id: string; card_title: string; card_icon: string | null; card_color: string | null; card_category: string | null }

const COLOR_GRADIENTS: Record<string, string> = {
  primary: 'from-indigo-500 to-purple-600', amber: 'from-amber-500 to-orange-500',
  red: 'from-red-500 to-rose-600', emerald: 'from-emerald-500 to-teal-500',
};
const LOCATION_GRADIENTS = [
  'from-fuchsia-500 to-pink-600', 'from-sky-500 to-cyan-500', 'from-lime-500 to-green-600',
  'from-rose-400 to-amber-400', 'from-cyan-500 to-indigo-700', 'from-orange-400 to-rose-500',
];
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { Boxes, CheckCircle2, ShieldAlert };

function fmtDate(d: string | null): string {
  if (!d) return ''; const [y, m, day] = d.slice(0, 10).split('-'); return y ? `${day}-${m}-${y}` : d;
}
function statusBadge(s: SealStatus): string {
  if (s === 'Used') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s === 'Damaged') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

async function fetchOpts(url: string, label: (r: Record<string, unknown>) => string): Promise<Opt[]> {
  try {
    const r = await fetch(url); const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : [];
    return list.map((row: Record<string, unknown>) => ({ id: row.id as number, label: label(row) }));
  } catch { return []; }
}

export default function SealPage() {
  const [offices, setOffices] = useState<Opt[]>([]);
  const [stats, setStats] = useState<SealStats | null>(null);
  const [cards, setCards] = useState<DashboardCard[]>([]);

  // masters list + filters
  const [masters, setMasters] = useState<SealMasterListRow[]>([]);
  const [masterStatus, setMasterStatus] = useState<'' | 'Used' | 'Damaged'>('');
  const [masterLocation, setMasterLocation] = useState(0);
  const [activeCard, setActiveCard] = useState('all');
  const [masterSearch, setMasterSearch] = useState('');

  // numbers tracker + filters
  const [numbers, setNumbers] = useState<SealNumberListRow[]>([]);
  const [numStatus, setNumStatus] = useState<'' | SealStatus>('');
  const [numLocation, setNumLocation] = useState(0);
  const [numSearch, setNumSearch] = useState('');

  // form
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ office_location_id: '', sub_location: '', purchase_date: '', total_amount: '', display: 'Y' as 'Y' | 'N' });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // modals
  const [manageFor, setManageFor] = useState<SealMasterListRow | null>(null);
  const [viewData, setViewData] = useState<Record<string, unknown> | null>(null);
  const [editNumber, setEditNumber] = useState<{ id: number; seal_number: string; status: SealStatus; notes: string; location: string } | null>(null);

  const totalSeal = useMemo(() => {
    const amt = parseFloat(form.total_amount); return Number.isFinite(amt) && amt > 0 ? Math.floor(amt / SEAL_UNIT_PRICE) : 0;
  }, [form.total_amount]);

  const loadStats = useCallback(async () => {
    const s = await safeFetchJson<SealStats>('/api/seals/stats'); if (s.ok) setStats(s.data);
  }, []);
  const loadMasters = useCallback(async () => {
    const p = new URLSearchParams();
    if (masterStatus) p.set('status', masterStatus);
    if (masterLocation) p.set('location', String(masterLocation));
    const r = await safeFetchJson<SealMasterListRow[]>(`/api/seals?${p.toString()}`);
    if (r.ok) setMasters(r.data);
  }, [masterStatus, masterLocation]);
  const loadNumbers = useCallback(async () => {
    const p = new URLSearchParams();
    if (numStatus) p.set('status', numStatus);
    if (numLocation) p.set('location', String(numLocation));
    const r = await safeFetchJson<SealNumberListRow[]>(`/api/seal-numbers?${p.toString()}`);
    if (r.ok) setNumbers(r.data);
  }, [numStatus, numLocation]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { loadNumbers(); }, [loadNumbers]);
  useEffect(() => {
    (async () => {
      setOffices(await fetchOpts('/api/main-offices?pageSize=1000', (r) => String(r.main_location_name ?? r.id)));
      const c = await safeFetchJson<DashboardCard[]>('/api/dashboard-cards/me');
      if (c.ok) setCards(c.data.filter((x) => x.card_category === 'seal_dashboard'));
    })();
  }, []);

  function cardValue(key: string): number {
    if (!stats) return 0;
    if (key === 'all') return stats.total_seals;
    if (key === 'used') return stats.used_seals;
    if (key === 'damaged') return stats.damaged_seals;
    return 0;
  }
  function clickStatusCard(key: string) {
    setActiveCard(key);
    setMasterLocation(0);
    setMasterStatus(key === 'used' ? 'Used' : key === 'damaged' ? 'Damaged' : '');
  }
  function clickLocationCard(id: number) {
    setActiveCard(`loc-${id}`);
    setMasterStatus('');
    setMasterLocation(id);
  }

  // ---- masters table ----
  const mastersFiltered = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return masters;
    return masters.filter((m) => (m.location_name ?? '').toLowerCase().includes(q) || (m.sub_office_code ?? '').toLowerCase().includes(q) || String(m.id).includes(q));
  }, [masters, masterSearch]);
  const mp = usePagedList(mastersFiltered, { initialPageSize: 25 });

  // ---- numbers table ----
  const numbersFiltered = useMemo(() => {
    const q = numSearch.trim().toLowerCase();
    if (!q) return numbers;
    return numbers.filter((n) => n.seal_number.toLowerCase().includes(q) || (n.location ?? '').toLowerCase().includes(q) || (n.notes ?? '').toLowerCase().includes(q));
  }, [numbers, numSearch]);
  const np = usePagedList(numbersFiltered, { initialPageSize: 25 });

  // ---- form ----
  function resetForm() {
    setEditId(null); setForm({ office_location_id: '', sub_location: '', purchase_date: '', total_amount: '', display: 'Y' }); setFormErr(null);
  }
  async function loadForEdit(id: number) {
    const r = await fetch(`/api/seals/${id}`); const j = await r.json();
    if (!j.success) return;
    const d = j.data;
    setEditId(id);
    setForm({
      office_location_id: d.office_location_id ? String(d.office_location_id) : '',
      sub_location: d.sub_office_code ?? '',
      purchase_date: d.purchase_date ?? '',
      total_amount: d.total_amount != null ? String(d.total_amount) : '',
      display: (d.display as 'Y' | 'N') ?? 'Y',
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function saveMaster() {
    setFormErr(null);
    if (!form.office_location_id) { setFormErr('Office Location is required'); return; }
    if (!form.purchase_date) { setFormErr('Purchase Date is required'); return; }
    if (!(parseFloat(form.total_amount) > 0)) { setFormErr('Total Amount must be greater than 0'); return; }
    setSaving(true);
    const payload = {
      office_location_id: Number(form.office_location_id),
      purchase_date: form.purchase_date,
      sub_office_code: form.sub_location || null,
      total_amount: Number(form.total_amount),
      display: form.display,
    };
    try {
      const url = editId ? `/api/seals/${editId}` : '/api/seals';
      const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || !j.success) { setFormErr(j.message || 'Save failed'); return; }
      resetForm(); await loadMasters(); await loadStats();
    } catch { setFormErr('Save failed'); } finally { setSaving(false); }
  }
  async function deleteMaster(id: number) {
    if (!confirm('Delete this seal master (and its seal numbers)?')) return;
    const res = await fetch(`/api/seals/${id}`, { method: 'DELETE' }); const j = await res.json();
    if (!j.success) { alert(j.message || 'Failed'); return; }
    await loadMasters(); await loadStats(); await loadNumbers();
  }
  async function openView(id: number) {
    const r = await fetch(`/api/seals/${id}`); const j = await r.json();
    if (j.success) setViewData(j.data);
  }

  async function afterNumbersChanged() {
    await Promise.all([loadMasters(), loadStats(), loadNumbers()]);
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      {/* ---- stat cards ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {cards.map((card) => {
          const Icon = (card.card_icon && ICONS[card.card_icon]) || Boxes;
          const gradient = (card.card_color && COLOR_GRADIENTS[card.card_color]) || COLOR_GRADIENTS.primary;
          const active = activeCard === card.card_content_id;
          return (
            <button key={card.id} type="button" onClick={() => clickStatusCard(card.card_content_id)}
              className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-4 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}>
              <Icon className="h-8 w-8 absolute right-3 top-3 opacity-25" />
              <div className="text-3xl font-bold leading-none">{cardValue(card.card_content_id)}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.card_title}</div>
              {card.card_content_id === 'all' && stats && <div className="text-[11px] opacity-80 mt-0.5">Added: {stats.added_seals}</div>}
            </button>
          );
        })}
        {stats?.location_counts.map((loc, i) => {
          const gradient = LOCATION_GRADIENTS[i % LOCATION_GRADIENTS.length];
          const active = activeCard === `loc-${loc.id}`;
          return (
            <button key={loc.id} type="button" onClick={() => clickLocationCard(loc.id)}
              className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-4 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}>
              <MapPin className="h-8 w-8 absolute right-3 top-3 opacity-25" />
              <div className="text-3xl font-bold leading-none">{loc.seal_count}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{loc.main_location_name}</div>
              <div className="text-[11px] opacity-80 mt-0.5">Added: {loc.added_count}</div>
            </button>
          );
        })}
      </div>

      {/* ---- form accordion ---- */}
      <div className="rounded-xl overflow-hidden mb-4 shadow-sm border border-slate-200">
        <div className="w-full flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <button type="button" onClick={() => setFormOpen((v) => !v)} className="font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" /> {editId ? 'Edit Seal' : 'Add New Seal'}
            <ChevronDown className={`h-5 w-5 transition-transform ${formOpen ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={() => { window.location.href = '/api/seals/export-all'; }}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm font-medium">
            <FileSpreadsheet className="h-4 w-4" /> Export All to Excel
          </button>
        </div>
        {formOpen && (
          <div className="p-4 bg-white">
            {formErr && <div className="rounded-md bg-red-50 p-2 mb-3 text-sm text-red-700 border border-red-200">{formErr}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
              <div>
                <label className="label">Office Location <span className="text-red-500">*</span></label>
                <select className="input" value={form.office_location_id} onChange={(e) => setForm({ ...form, office_location_id: e.target.value })}>
                  <option value="">-- Select --</option>
                  {offices.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>
              <div>
                <label className="label">Sub Location</label>
                <select className="input" value={form.sub_location} onChange={(e) => setForm({ ...form, sub_location: e.target.value })}>
                  <option value="">Select</option>
                  <option value="AMI">Ami Congo</option>
                  <option value="EP">EP Ville</option>
                </select>
              </div>
              <div>
                <label className="label">Purchase Date <span className="text-red-500">*</span></label>
                <input type="date" className="input" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Total Amount ($) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" className="input" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} placeholder="Enter total amount" />
              </div>
              <div>
                <label className="label">Per Seal Amount</label>
                <input className="input bg-slate-100" value={`$${SEAL_UNIT_PRICE.toFixed(2)}`} readOnly />
              </div>
              <div>
                <label className="label">Total Seal (auto)</label>
                <input className="input bg-slate-100 font-semibold" value={totalSeal} readOnly />
              </div>
              <div>
                <label className="label">Display</label>
                <select className="input" value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value as 'Y' | 'N' })}>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={resetForm} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
              <button type="button" onClick={saveMaster} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving...' : editId ? 'Update Seal' : 'Save Seal'}</button>
            </div>
          </div>
        )}
      </div>

      {/* ---- masters list ---- */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-800 flex items-center gap-2"><ListOrdered className="h-4 w-4 text-slate-500" /> Seal Masters List
            {(masterStatus || masterLocation) ? <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">filtered</span> : null}
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9 text-sm w-56" placeholder="Search location, sub office..." value={masterSearch} onChange={(e) => { setMasterSearch(e.target.value); mp.resetPage(); }} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th className="w-12">#</th><th>Office Location</th><th>Sub Office</th><th>Purchase Date</th><th className="text-right">Total Amount</th><th className="text-right">Total Seal</th><th className="text-center">Added</th><th>Display</th><th className="text-center">Actions</th></tr>
            </thead>
            <tbody>
              {mp.paged.length === 0 && (<tr><td colSpan={9} className="text-center text-slate-500 py-8">No seals found.</td></tr>)}
              {mp.paged.map((m, idx) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{mp.startIndex + idx + 1}</td>
                  <td className="font-medium">{m.location_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-600 text-xs">{m.sub_office_code || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-600 text-xs">{fmtDate(m.purchase_date)}</td>
                  <td className="text-right text-slate-700 text-xs">${Number(m.total_amount ?? 0).toFixed(2)}</td>
                  <td className="text-right text-slate-700 text-xs">{m.total_seal}</td>
                  <td className="text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${m.added_seals >= m.total_seal && m.total_seal > 0 ? 'bg-emerald-100 text-emerald-700' : m.added_seals > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{m.added_seals}</span>
                  </td>
                  <td>{m.display === 'Y' ? <span className="text-emerald-600 text-xs font-medium">Yes</span> : <span className="text-red-500 text-xs font-medium">No</span>}</td>
                  <td>
                    <div className="inline-flex rounded-md shadow-sm overflow-hidden w-full justify-center">
                      <button type="button" onClick={() => setManageFor(m)} title="Manage Seal Numbers" className="inline-flex items-center justify-center w-7 h-7 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"><ListOrdered className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => openView(m.id)} title="View" className="inline-flex items-center justify-center w-7 h-7 bg-slate-600 hover:bg-slate-700 text-white"><Eye className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => loadForEdit(m.id)} title="Edit" className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { window.location.href = `/api/seals/${m.id}/export`; }} title="Export" className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white"><FileSpreadsheet className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => deleteMaster(m.id)} title="Delete" className="inline-flex items-center justify-center w-7 h-7 bg-red-600 hover:bg-red-700 text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationFooter page={mp.page} setPage={mp.setPage} pageSize={mp.pageSize} setPageSize={mp.setPageSize} totalRows={mp.totalRows} totalPages={mp.totalPages} startIndex={mp.startIndex} mounted={mp.mounted} />
      </div>

      {/* ---- individual seal numbers tracker ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-semibold text-slate-800 flex items-center gap-2"><ListOrdered className="h-4 w-4 text-slate-500" /> Seal Numbers — Usage Tracker</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9 text-sm w-56" placeholder="Search seal number, location..." value={numSearch} onChange={(e) => { setNumSearch(e.target.value); np.resetPage(); }} />
          </div>
        </div>
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-2">
          {([['', 'All'], ['Available', 'Available'], ['Used', 'Used'], ['Damaged', 'Damaged']] as Array<['' | SealStatus, string]>).map(([val, lbl]) => (
            <button key={lbl} type="button" onClick={() => { setNumStatus(val); setNumLocation(0); np.resetPage(); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${numStatus === val && numLocation === 0 ? 'bg-primary-600 text-white border-primary-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{lbl}</button>
          ))}
          {offices.map((o) => (
            <button key={o.id} type="button" onClick={() => { setNumLocation(o.id); setNumStatus(''); np.resetPage(); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border inline-flex items-center gap-1 ${numLocation === o.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}><MapPin className="h-3.5 w-3.5" /> {o.label}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th className="w-12">#</th><th>Seal Number</th><th>Status</th><th>Location</th><th>Purchase Date</th><th>Notes</th><th>Created</th></tr>
            </thead>
            <tbody>
              {np.paged.length === 0 && (<tr><td colSpan={7} className="text-center text-slate-500 py-8">No seal numbers found.</td></tr>)}
              {np.paged.map((nrow, idx) => (
                <tr key={nrow.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{np.startIndex + idx + 1}</td>
                  <td className="font-mono font-semibold">{nrow.seal_number}</td>
                  <td><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge(nrow.status)}`}>{nrow.status}</span></td>
                  <td className="text-slate-700 text-xs">{nrow.location || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-600 text-xs">{fmtDate(nrow.purchase_date)}</td>
                  <td className="text-slate-600 text-xs">{nrow.notes || <span className="text-slate-300">No notes</span>}</td>
                  <td className="text-slate-600 text-xs">{fmtDate(nrow.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationFooter page={np.page} setPage={np.setPage} pageSize={np.pageSize} setPageSize={np.setPageSize} totalRows={np.totalRows} totalPages={np.totalPages} startIndex={np.startIndex} mounted={np.mounted} />
      </div>

      {manageFor && (
        <ManageNumbersModal master={manageFor} onClose={() => setManageFor(null)} onChanged={afterNumbersChanged} onEditNumber={setEditNumber} />
      )}
      {editNumber && (
        <EditNumberModal data={editNumber} onClose={() => setEditNumber(null)} onSaved={async () => { setEditNumber(null); await afterNumbersChanged(); }} />
      )}
      {viewData && (
        <ViewModal data={viewData} onClose={() => setViewData(null)} />
      )}
    </DashboardShell>
  );
}

// ---- Manage Seal Numbers modal ----
function ManageNumbersModal({ master, onClose, onChanged, onEditNumber }: {
  master: SealMasterListRow;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEditNumber: (n: { id: number; seal_number: string; status: SealStatus; notes: string; location: string }) => void;
}) {
  const [list, setList] = useState<Array<{ id: number; seal_number: string; status: SealStatus; notes: string | null; location: string | null }>>([]);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [single, setSingle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/seals/${master.id}/numbers`); const j = await r.json();
    if (j.success) setList(j.data);
  }, [master.id]);
  useEffect(() => { load(); }, [load]);

  const added = list.length;
  const limit = master.total_seal;
  const pct = limit > 0 ? Math.min(100, Math.round((added / limit) * 100)) : 0;

  function parseRange(): { ok: boolean; nums?: string[]; message?: string } {
    const ms = start.trim().match(/^([A-Za-z]*)(\d+)$/);
    const me = end.trim().match(/^([A-Za-z]*)(\d+)$/);
    if (!ms || !me) return { ok: false, message: 'Invalid format. Use e.g. BB91002' };
    if (ms[1] !== me[1]) return { ok: false, message: `Prefixes must match (${ms[1]} vs ${me[1]})` };
    const a = parseInt(ms[2], 10); const b = parseInt(me[2], 10);
    if (a >= b) return { ok: false, message: 'Start must be less than end' };
    const count = b - a + 1;
    if (count > 500) return { ok: false, message: 'Max 500 at once' };
    const width = ms[2].length;
    const nums: string[] = [];
    for (let i = a; i <= b; i += 1) nums.push(ms[1] + String(i).padStart(width, '0'));
    return { ok: true, nums };
  }

  async function add() {
    setErr(null);
    let nums: string[] = [];
    if (mode === 'single') {
      if (!single.trim()) { setErr('Enter a seal number'); return; }
      nums = [single.trim()];
    } else {
      const r = parseRange();
      if (!r.ok) { setErr(r.message ?? 'Invalid range'); return; }
      nums = r.nums!;
    }
    if (nums.length > limit - added) { setErr(`Only ${limit - added} slot(s) available`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/seals/${master.id}/numbers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seal_numbers: nums }) });
      const j = await res.json();
      if (!res.ok || !j.success) { setErr(j.message || 'Failed'); return; }
      setSingle(''); setStart(''); setEnd('');
      await load(); await onChanged();
    } catch { setErr('Failed'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-4xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <h2 className="font-semibold flex items-center gap-2"><ListOrdered className="h-5 w-5" /> Manage Seal Numbers — {master.location_name}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 max-h-[75vh] overflow-y-auto">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">Add Seal Numbers</div>
            <div className="text-xs text-slate-500 mb-1">Added: {added} / {limit}</div>
            <div className="w-full h-2 rounded bg-slate-200 mb-3 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-300 mb-3">
              <button type="button" onClick={() => setMode('single')} className={`px-3 py-1.5 text-sm ${mode === 'single' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600'}`}>Single</button>
              <button type="button" onClick={() => setMode('range')} className={`px-3 py-1.5 text-sm ${mode === 'range' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600'}`}>Range</button>
            </div>
            {err && <div className="rounded-md bg-red-50 p-2 mb-2 text-xs text-red-700 border border-red-200">{err}</div>}
            {mode === 'single' ? (
              <input className="input" placeholder="e.g. BB91002" value={single} onChange={(e) => setSingle(e.target.value)} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Start e.g. BB91002" value={start} onChange={(e) => setStart(e.target.value)} />
                <input className="input" placeholder="End e.g. BB91101" value={end} onChange={(e) => setEnd(e.target.value)} />
                {start && end && (() => { const r = parseRange(); return <div className="col-span-2 text-xs text-slate-500">{r.ok ? `Will add ${r.nums!.length} seal(s)` : r.message}</div>; })()}
              </div>
            )}
            <button type="button" onClick={add} disabled={busy || added >= limit} className="btn-primary w-full mt-3">
              <Plus className="h-4 w-4" /> {busy ? 'Adding...' : 'Add Seal Number(s)'}
            </button>
            {added >= limit && <div className="text-xs text-amber-600 mt-2">Limit reached.</div>}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Existing Seal Numbers ({added})</div>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {list.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No seal numbers yet.</div>}
              {list.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-semibold">{s.seal_number}</span>
                    <span className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge(s.status)}`}>{s.status}</span>
                    {s.notes && <div className="text-xs text-slate-500 mt-0.5">{s.notes}</div>}
                  </div>
                  <button type="button" onClick={() => onEditNumber({ id: s.id, seal_number: s.seal_number, status: s.status, notes: s.notes ?? '', location: s.location ?? '' })}
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"><Edit2 className="h-3.5 w-3.5" /> Edit</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary"><X className="h-4 w-4" /> Close</button>
        </div>
      </div>
    </div>
  );
}

// ---- Edit Seal Number modal ----
function EditNumberModal({ data, onClose, onSaved }: {
  data: { id: number; seal_number: string; status: SealStatus; notes: string; location: string };
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [seal, setSeal] = useState(data.seal_number);
  const [status, setStatus] = useState<SealStatus>(data.status);
  const [notes, setNotes] = useState(data.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wasUsed = data.status === 'Used';

  async function save() {
    setErr(null);
    if (wasUsed && status === 'Damaged') { setErr('Cannot change "Used" to "Damaged".'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/seal-numbers/${data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seal_number: seal, status, notes: notes || null }) });
      const j = await res.json();
      if (!res.ok || !j.success) { setErr(j.message || 'Failed'); return; }
      await onSaved();
    } catch { setErr('Failed'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <h2 className="font-semibold flex items-center gap-2"><Edit2 className="h-5 w-5" /> Edit Seal Number</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{err}</div>}
          <div><label className="label">Location</label><input className="input bg-slate-100" value={data.location} readOnly /></div>
          <div><label className="label">Seal Number *</label><input className="input" value={seal} onChange={(e) => setSeal(e.target.value)} /></div>
          <div>
            <label className="label">Status *</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SealStatus)}>
              <option value="Available">Available</option>
              <option value="Used">Used</option>
              <option value="Damaged" disabled={wasUsed}>Damaged</option>
            </select>
            {wasUsed && <div className="text-xs text-amber-600 mt-1">A "Used" seal cannot be changed to "Damaged".</div>}
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary"><Save className="h-4 w-4" /> {busy ? 'Updating...' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- View modal ----
function ViewModal({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const fields: Array<[string, unknown]> = [
    ['Office Location', data.main_location_name],
    ['Sub Office', data.sub_office_code],
    ['Purchase Date', fmtDate((data.purchase_date as string) ?? null)],
    ['Total Amount', `$${Number(data.total_amount ?? 0).toFixed(2)}`],
    ['Total Seal', data.total_seal],
    ['Display', data.display === 'Y' ? 'Yes' : 'No'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <h2 className="font-semibold flex items-center gap-2"><Eye className="h-5 w-5" /> Seal Details</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(([label, value]) => (
            <div key={label} className="border-b border-slate-100 pb-2">
              <div className="text-[11px] uppercase tracking-wide text-primary-600 font-semibold">{label}</div>
              <div className="text-sm text-slate-800">{value !== null && value !== undefined && value !== '' ? String(value) : <span className="text-slate-300">—</span>}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary"><X className="h-4 w-4" /> Close</button>
        </div>
      </div>
    </div>
  );
}
