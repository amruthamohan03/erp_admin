'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, Copy, Save, X, FileText, Boxes, Send, Layers, CalendarClock, Search, ChevronDown,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { safeFetchJson } from '@/lib/safeFetch';
import type { QuotationListRow } from '@/types';

interface Opt { id: number; label: string }
interface Category { id: number; category_name: string; category_header: string | null; display_order: number; is_customs: boolean }
interface ItemOpt { id: number; name: string; category_id: number | null; item_type: string }
interface DashboardCard { id: number; card_content_id: string; card_title: string; card_icon: string | null; card_color: string | null; card_category: string | null }

interface Row {
  uid: number;
  item_id: string;
  unit_id: string;
  currency_id: string;
  has_tva: boolean;
  quantity: string;
  cost_usd: string;
  taux_usd: string;
  cif_split: string;
  percentage: string;
  rate_cdf: string;
}

const VAT = 0.16;
const ARSP = 0.012;

const COLOR_GRADIENTS: Record<string, string> = {
  primary: 'from-indigo-500 to-purple-600', emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-600', violet: 'from-violet-500 to-indigo-600',
  amber: 'from-amber-500 to-orange-500', slate: 'from-slate-500 to-slate-700',
};
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { FileText, Boxes, Send, Layers, CalendarClock };

let UID = 1;
const n = (v: string): number => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const money = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchOpts(url: string, label: (r: Record<string, unknown>) => string): Promise<Opt[]> {
  try {
    const r = await fetch(url); const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : [];
    return list.map((row: Record<string, unknown>) => ({ id: row.id as number, label: label(row) }));
  } catch { return []; }
}

function emptyRow(currencyId: string): Row {
  return { uid: UID++, item_id: '', unit_id: '', currency_id: currencyId, has_tva: false,
    quantity: '', cost_usd: '', taux_usd: '', cif_split: '', percentage: '', rate_cdf: '' };
}

export default function QuotationPage() {
  // master data
  const [clients, setClients] = useState<Opt[]>([]);
  const [kinds, setKinds] = useState<Opt[]>([]);
  const [transports, setTransports] = useState<Opt[]>([]);
  const [goods, setGoods] = useState<Opt[]>([]);
  const [currencies, setCurrencies] = useState<Opt[]>([]);
  const [units, setUnits] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const defaultCurrency = useMemo(() => {
    const usd = currencies.find((c) => c.label.toUpperCase() === 'USD');
    return usd ? String(usd.id) : '';
  }, [currencies]);

  // header
  const [quotationId, setQuotationId] = useState<number | null>(null);
  const [clientId, setClientId] = useState('');
  const [kindId, setKindId] = useState('');
  const [transportId, setTransportId] = useState('');
  const [goodsId, setGoodsId] = useState('');
  const [arsp, setArsp] = useState<'Enabled' | 'Disabled'>('Disabled');
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));

  // line rows keyed by category id
  const [rows, setRows] = useState<Record<number, Row[]>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(true);

  // list + cards
  const [list, setList] = useState<QuotationListRow[]>([]);
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [activeCard, setActiveCard] = useState('all');

  const kindName = useMemo(() => kinds.find((k) => String(k.id) === kindId)?.label ?? '', [kinds, kindId]);
  const isED = kindName.toUpperCase().includes('EXPORT');
  const isImportDefinitive = kindName.toUpperCase().includes('DEFINIT');
  // §legacy — quotation items only appear once all four header keys are chosen
  // (the same combination that builds the reference).
  const headerComplete = Boolean(clientId && kindId && transportId && goodsId);

  const itemsByCat = useMemo(() => {
    const m = new Map<number, ItemOpt[]>();
    for (const it of items) {
      if (it.category_id == null) continue;
      const arr = m.get(it.category_id) ?? [];
      arr.push(it);
      m.set(it.category_id, arr);
    }
    return m;
  }, [items]);

  function descOptions(catId: number): ItemOpt[] {
    const letter = isED ? 'E' : 'I';
    return (itemsByCat.get(catId) ?? []).filter((it) => (it.item_type || '').includes(letter));
  }

  // ----- load master data -----
  useEffect(() => {
    (async () => {
      const [cl, ki, tr, go, cu, un] = await Promise.all([
        fetchOpts('/api/clients?pageSize=1000', (r) => String(r.short_name ?? r.company_name ?? r.id)),
        fetchOpts('/api/kinds?pageSize=1000', (r) => String(r.kind_name ?? r.id)),
        fetchOpts('/api/transport-modes?pageSize=1000', (r) => String(r.transport_mode_name ?? r.id)),
        fetchOpts('/api/type-of-goods?pageSize=1000', (r) => String(r.goods_type ?? r.id)),
        fetchOpts('/api/currencies?pageSize=1000', (r) => String(r.currency_short_name ?? r.id)),
        fetchOpts('/api/units?pageSize=1000', (r) => String(r.unit_code || r.unit_name || r.id)),
      ]);
      setClients(cl); setKinds(ki); setTransports(tr); setGoods(go); setCurrencies(cu); setUnits(un);

      const catRes = await fetch('/api/quotation-categories'); const catJson = await catRes.json();
      if (catJson.success) setCategories(catJson.data);
      const itRes = await fetch('/api/items'); const itJson = await itRes.json();
      if (itJson.success) {
        setItems(itJson.data.map((r: Record<string, unknown>) => ({
          id: r.id as number, name: String(r.item_name), category_id: (r.category_id as number) ?? null, item_type: String(r.item_type ?? ''),
        })));
      }
    })();
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.display_order - b.display_order || a.id - b.id),
    [categories],
  );

  // ----- list + cards -----
  const loadList = useCallback(async () => {
    const qs = activeCard && activeCard !== 'all' ? `?card=${activeCard}` : '';
    const res = await safeFetchJson<QuotationListRow[]>(`/api/quotations${qs}`);
    if (res.ok) setList(res.data);
  }, [activeCard]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        safeFetchJson<DashboardCard[]>('/api/dashboard-cards/me'),
        safeFetchJson<Record<string, number>>('/api/quotations/stats'),
      ]);
      if (c.ok) setCards(c.data.filter((x) => x.card_category === 'quotation_dashboard'));
      if (s.ok) setStats(s.data);
    })();
  }, []);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => (r.quotation_ref ?? '').toLowerCase().includes(q) || (r.client_code ?? '').toLowerCase().includes(q));
  }, [list, search]);
  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filteredList);

  // ----- ref auto-generate -----
  const quotationRef = useMemo(() => {
    const cl = clients.find((c) => String(c.id) === clientId)?.label;
    const ki = kinds.find((k) => String(k.id) === kindId)?.label;
    const tr = transports.find((t) => String(t.id) === transportId)?.label;
    const go = goods.find((g) => String(g.id) === goodsId)?.label;
    return cl && ki && tr && go ? `${cl}-${ki}-${tr}-${go}` : '';
  }, [clients, kinds, transports, goods, clientId, kindId, transportId, goodsId]);

  // ----- row helpers -----
  function setRow(catId: number, uid: number, patch: Partial<Row>) {
    setRows((prev) => ({ ...prev, [catId]: (prev[catId] ?? []).map((r) => (r.uid === uid ? { ...r, ...patch } : r)) }));
  }
  function addRow(catId: number) {
    setRows((prev) => ({ ...prev, [catId]: [...(prev[catId] ?? []), emptyRow(defaultCurrency)] }));
  }
  function removeRow(catId: number, uid: number) {
    setRows((prev) => ({ ...prev, [catId]: (prev[catId] ?? []).filter((r) => r.uid !== uid) }));
  }

  function rowTotals(r: Row, isCustomsCat: boolean) {
    if (isImportDefinitive && isCustomsCat) {
      const rate = n(r.rate_cdf); const vat = rate * VAT; return { vatCdf: vat, totalCdf: rate + vat, subtotal: 0, tva: 0, total: 0 };
    }
    if (isED) {
      const cost = n(r.cost_usd); const tva = r.has_tva ? cost * VAT : 0; return { subtotal: cost, tva, total: cost + tva, vatCdf: 0, totalCdf: 0 };
    }
    const line = n(r.quantity) * n(r.taux_usd); const tva = r.has_tva ? line * VAT : 0;
    return { subtotal: line, tva, total: line + tva, vatCdf: 0, totalCdf: 0 };
  }

  const summary = useMemo(() => {
    let subUsd = 0, vatUsd = 0, subCdf = 0, vatCdf = 0, arspBase = 0;
    for (const cat of sortedCategories) {
      const isCustomsCat = cat.is_customs;
      for (const r of rows[cat.id] ?? []) {
        if (!r.item_id) continue;
        const t = rowTotals(r, isCustomsCat);
        if (isImportDefinitive && isCustomsCat) { subCdf += n(r.rate_cdf); vatCdf += t.vatCdf; }
        else { subUsd += t.subtotal; vatUsd += t.tva; if (r.has_tva) arspBase += t.subtotal; }
      }
    }
    const arspAmount = arsp === 'Enabled' ? arspBase * ARSP : 0;
    return { subUsd, vatUsd, arspAmount, totalUsd: subUsd + vatUsd + arspAmount, subCdf, vatCdf, totalCdf: subCdf + vatCdf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortedCategories, isED, isImportDefinitive, arsp]);

  // When the four header keys are first completed on a fresh form, seed one empty
  // item row in the first category (mirrors the legacy auto-add on section show).
  useEffect(() => {
    if (!headerComplete || sortedCategories.length === 0) return;
    const anyRows = Object.values(rows).some((a) => a && a.length > 0);
    if (!anyRows) setRows((prev) => ({ ...prev, [sortedCategories[0].id]: [emptyRow(defaultCurrency)] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerComplete, sortedCategories.length]);

  // ----- reset / load -----
  function resetForm() {
    setQuotationId(null); setClientId(''); setKindId(''); setTransportId(''); setGoodsId('');
    setArsp('Disabled'); setQuotationDate(new Date().toISOString().slice(0, 10)); setRows({}); setErr(null); setMsg(null);
  }

  async function loadForEdit(id: number, copy = false) {
    const res = await fetch(`/api/quotations/${id}`); const j = await res.json();
    if (!j.success) { setErr('Failed to load quotation'); return; }
    const q = j.data.quotation; const its = j.data.items as Array<Record<string, unknown>>;
    setFormOpen(true);
    setQuotationId(copy ? null : q.id);
    setClientId(q.client_id ? String(q.client_id) : '');
    setKindId(q.kind_id ? String(q.kind_id) : '');
    setTransportId(q.transport_mode_id ? String(q.transport_mode_id) : '');
    setGoodsId(q.goods_type_id ? String(q.goods_type_id) : '');
    setArsp((q.arsp as 'Enabled' | 'Disabled') || 'Disabled');
    setQuotationDate(copy ? new Date().toISOString().slice(0, 10) : (q.quotation_date ?? new Date().toISOString().slice(0, 10)));
    const grouped: Record<number, Row[]> = {};
    for (const it of its) {
      const cat = it.category_id as number | null; if (cat == null) continue;
      (grouped[cat] ??= []).push({
        uid: UID++,
        item_id: it.item_id ? String(it.item_id) : '',
        unit_id: it.unit_id ? String(it.unit_id) : '',
        currency_id: it.currency_id ? String(it.currency_id) : defaultCurrency,
        has_tva: it.has_tva === true || it.has_tva === 1,
        quantity: it.quantity != null ? String(it.quantity) : '',
        cost_usd: it.cost_usd != null ? String(it.cost_usd) : '',
        taux_usd: it.taux_usd != null ? String(it.taux_usd) : '',
        cif_split: it.cif_split != null ? String(it.cif_split) : '',
        percentage: it.percentage != null ? String(it.percentage) : '',
        rate_cdf: it.rate_cdf != null ? String(it.rate_cdf) : '',
      });
    }
    setRows(grouped);
    setMsg(null); setErr(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ----- save -----
  async function save() {
    setErr(null); setMsg(null);
    if (!clientId || !kindId || !transportId || !goodsId) { setErr('Client, Kind, Transport and Type of Goods are required.'); return; }
    const flatItems: Array<Record<string, unknown>> = [];
    for (const cat of sortedCategories) {
      for (const r of rows[cat.id] ?? []) {
        if (!r.item_id) continue;
        flatItems.push({
          category_id: cat.id, item_id: Number(r.item_id),
          unit_id: r.unit_id ? Number(r.unit_id) : null,
          currency_id: r.currency_id ? Number(r.currency_id) : null,
          has_tva: r.has_tva,
          quantity: r.quantity ? Number(r.quantity) : 0,
          cost_usd: r.cost_usd ? Number(r.cost_usd) : 0,
          taux_usd: r.taux_usd ? Number(r.taux_usd) : 0,
          cif_split: r.cif_split ? Number(r.cif_split) : 0,
          percentage: r.percentage ? Number(r.percentage) : 0,
          rate_cdf: r.rate_cdf ? Number(r.rate_cdf) : 0,
        });
      }
    }
    if (flatItems.length === 0) { setErr('At least one item is required.'); return; }

    const payload = {
      client_id: Number(clientId), quotation_ref: quotationRef, quotation_date: quotationDate,
      kind_id: Number(kindId), transport_mode_id: Number(transportId), goods_type_id: Number(goodsId),
      arsp, items: flatItems,
    };
    setSaving(true);
    try {
      const url = quotationId ? `/api/quotations/${quotationId}` : '/api/quotations';
      const res = await fetch(url, { method: quotationId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || !j.success) { setErr(j.message || 'Save failed'); return; }
      setMsg(quotationId ? 'Quotation updated.' : 'Quotation created.');
      resetForm();
      await loadList();
      const s = await safeFetchJson<Record<string, number>>('/api/quotations/stats'); if (s.ok) setStats(s.data);
    } catch { setErr('Save failed'); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this quotation?')) return;
    const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!j.success) { alert(j.message || 'Failed'); return; }
    await loadList();
    const s = await safeFetchJson<Record<string, number>>('/api/quotations/stats'); if (s.ok) setStats(s.data);
  }

  function fmtDate(d: string | null): string {
    if (!d) return ''; const [y, m, day] = d.slice(0, 10).split('-'); return y ? `${day}/${m}/${y}` : d;
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      <div className="card p-4 mb-4 flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" /> Quotations Management
        </h1>
      </div>

      {/* cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || FileText;
            const gradient = (card.card_color && COLOR_GRADIENTS[card.card_color]) || COLOR_GRADIENTS.primary;
            const active = activeCard === key;
            return (
              <button key={card.id} type="button" onClick={() => { setActiveCard(key); resetPage(); }}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}>
                <div className="absolute right-2 top-2 opacity-30"><Icon className="h-5 w-5" /></div>
                <div className="text-2xl font-bold leading-none">{stats[key] ?? 0}</div>
                <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.card_title}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* form accordion */}
      <div className="rounded-xl overflow-hidden mb-4 shadow-sm border border-slate-200">
        <button type="button" onClick={() => setFormOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <span className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> {quotationId ? 'Edit Quotation' : 'Add New Quotation'}
          </span>
          <ChevronDown className={`h-5 w-5 transition-transform ${formOpen ? 'rotate-180' : ''}`} />
        </button>
        {formOpen && (
        <div className="p-4 bg-white">
          {err && <div className="rounded-md bg-red-50 p-2 mb-3 text-sm text-red-700 border border-red-200">{err}</div>}
          {msg && <div className="rounded-md bg-emerald-50 p-2 mb-3 text-sm text-emerald-700 border border-emerald-200">{msg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="label">Client *</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select Client</option>
                {clients.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Quotation Ref *</label>
              <input className="input bg-indigo-50 font-semibold text-indigo-700 text-center" value={quotationRef} readOnly placeholder="Auto-generated" />
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Kind *</label>
              <select className="input" value={kindId} onChange={(e) => setKindId(e.target.value)}>
                <option value="">Select Kind</option>
                {kinds.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Transport *</label>
              <select className="input" value={transportId} onChange={(e) => setTransportId(e.target.value)}>
                <option value="">Select Transport</option>
                {transports.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Type of Goods *</label>
              <select className="input" value={goodsId} onChange={(e) => setGoodsId(e.target.value)}>
                <option value="">Select Type</option>
                {goods.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">ARSP *</label>
              <select className="input" value={arsp} onChange={(e) => setArsp(e.target.value as 'Enabled' | 'Disabled')}>
                <option value="Disabled">Disabled</option>
                <option value="Enabled">Enabled</option>
              </select>
            </div>
          </div>

          {/* category sections — only after Client + Kind + Transport + Type of Goods */}
          {!headerComplete && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 mb-4">
              Select <strong>Client</strong>, <strong>Kind</strong>, <strong>Transport</strong> and <strong>Type of Goods</strong> to add quotation items.
            </div>
          )}
          {headerComplete && sortedCategories.map((cat) => {
            const cdf = isImportDefinitive && cat.is_customs;
            const opts = descOptions(cat.id);
            const catRows = rows[cat.id] ?? [];
            return (
              <div key={cat.id} className="mb-4">
                <div className="rounded-md bg-slate-700 text-white px-3 py-2 text-sm font-semibold uppercase tracking-wide">
                  {cat.category_header || cat.category_name}
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-b-md">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-2 py-2 text-left min-w-[180px]">DESCRIPTION</th>
                        <th className="px-2 py-2 min-w-[80px]">UNIT</th>
                        {cdf ? (<>
                          <th className="px-2 py-2 min-w-[110px]">CIF/SPLIT</th>
                          <th className="px-2 py-2 min-w-[80px]">%</th>
                          <th className="px-2 py-2 min-w-[110px]">RATE/CDF</th>
                          <th className="px-2 py-2 min-w-[110px]">VAT/CDF</th>
                          <th className="px-2 py-2 min-w-[110px]">TOTAL/CDF</th>
                        </>) : isED ? (<>
                          <th className="px-2 py-2 min-w-[110px]">COST/USD</th>
                          <th className="px-2 py-2 min-w-[110px]">SUBTOTAL</th>
                          <th className="px-2 py-2 min-w-[80px]">CUR</th>
                          <th className="px-2 py-2 min-w-[70px]">TVA</th>
                          <th className="px-2 py-2 min-w-[100px]">TVA-16</th>
                          <th className="px-2 py-2 min-w-[110px]">TOTAL USD</th>
                        </>) : (<>
                          <th className="px-2 py-2 min-w-[80px]">QTY</th>
                          <th className="px-2 py-2 min-w-[110px]">TAUX/USD</th>
                          <th className="px-2 py-2 min-w-[80px]">CUR</th>
                          <th className="px-2 py-2 min-w-[70px]">TVA</th>
                          <th className="px-2 py-2 min-w-[100px]">TVA/USD</th>
                          <th className="px-2 py-2 min-w-[110px]">TOTAL USD</th>
                        </>)}
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catRows.length === 0 && (
                        <tr><td colSpan={9} className="px-3 py-3 text-center text-slate-400">No items — click + to add.</td></tr>
                      )}
                      {catRows.map((r) => {
                        const t = rowTotals(r, cat.is_customs);
                        return (
                          <tr key={r.uid} className="border-t border-slate-100">
                            <td className="px-2 py-1">
                              <select className="input py-1 text-xs" value={r.item_id} onChange={(e) => setRow(cat.id, r.uid, { item_id: e.target.value })}>
                                <option value="">Select Description</option>
                                {opts.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <select className="input py-1 text-xs" value={r.unit_id} onChange={(e) => setRow(cat.id, r.uid, { unit_id: e.target.value })}>
                                <option value="">Unit</option>
                                {units.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                              </select>
                            </td>
                            {cdf ? (<>
                              <td className="px-2 py-1"><input type="number" step="0.01" className="input py-1 text-xs text-right" value={r.cif_split} onChange={(e) => setRow(cat.id, r.uid, { cif_split: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1"><input type="number" step="0.0001" className="input py-1 text-xs text-right" value={r.percentage} onChange={(e) => setRow(cat.id, r.uid, { percentage: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1"><input type="number" step="0.01" className="input py-1 text-xs text-right" value={r.rate_cdf} onChange={(e) => setRow(cat.id, r.uid, { rate_cdf: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1 text-right text-slate-600">{money(t.vatCdf)}</td>
                              <td className="px-2 py-1 text-right font-semibold text-emerald-700">{money(t.totalCdf)}</td>
                            </>) : isED ? (<>
                              <td className="px-2 py-1"><input type="number" step="0.01" className="input py-1 text-xs text-right" value={r.cost_usd} onChange={(e) => setRow(cat.id, r.uid, { cost_usd: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1 text-right text-slate-600">{money(t.subtotal)}</td>
                              <td className="px-2 py-1">
                                <select className="input py-1 text-xs" value={r.currency_id} onChange={(e) => setRow(cat.id, r.uid, { currency_id: e.target.value })}>
                                  <option value="">CUR</option>
                                  {currencies.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                                </select>
                              </td>
                              <td className="px-2 py-1 text-center"><Toggle size="sm" checked={r.has_tva} onChange={(v) => setRow(cat.id, r.uid, { has_tva: v })} /></td>
                              <td className="px-2 py-1 text-right text-slate-600">{money(t.tva)}</td>
                              <td className="px-2 py-1 text-right font-semibold text-amber-700">{money(t.total)}</td>
                            </>) : (<>
                              <td className="px-2 py-1"><input type="number" step="0.01" className="input py-1 text-xs text-right" value={r.quantity} onChange={(e) => setRow(cat.id, r.uid, { quantity: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1"><input type="number" step="0.01" className="input py-1 text-xs text-right" value={r.taux_usd} onChange={(e) => setRow(cat.id, r.uid, { taux_usd: e.target.value })} placeholder="0.00" /></td>
                              <td className="px-2 py-1">
                                <select className="input py-1 text-xs" value={r.currency_id} onChange={(e) => setRow(cat.id, r.uid, { currency_id: e.target.value })}>
                                  <option value="">CUR</option>
                                  {currencies.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                                </select>
                              </td>
                              <td className="px-2 py-1 text-center"><Toggle size="sm" checked={r.has_tva} onChange={(v) => setRow(cat.id, r.uid, { has_tva: v })} /></td>
                              <td className="px-2 py-1 text-right text-slate-600">{money(t.tva)}</td>
                              <td className="px-2 py-1 text-right font-semibold text-amber-700">{money(t.total)}</td>
                            </>)}
                            <td className="px-2 py-1 text-center">
                              <button type="button" onClick={() => removeRow(cat.id, r.uid)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => addRow(cat.id)} className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                  <Plus className="h-4 w-4" /> Add item
                </button>
              </div>
            );
          })}

          {/* summary */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm max-w-xl ml-auto">
              <span className="text-slate-600">Sub-Total (USD)</span><span className="text-right font-semibold">{money(summary.subUsd)}</span>
              <span className="text-slate-600">VAT (16%)</span><span className="text-right font-semibold">{money(summary.vatUsd)}</span>
              <span className="text-slate-600">ARSP (1.2%)</span><span className="text-right font-semibold">{money(summary.arspAmount)}</span>
              <span className="text-primary-700 font-semibold">TOTAL EN USD</span><span className="text-right font-bold text-primary-700">{money(summary.totalUsd)}</span>
              {isImportDefinitive && (<>
                <span className="text-slate-600 pt-2 border-t border-slate-200 mt-1">Sub-Total (CDF)</span><span className="text-right font-semibold pt-2 border-t border-slate-200 mt-1">{money(summary.subCdf)}</span>
                <span className="text-slate-600">VAT (CDF)</span><span className="text-right font-semibold">{money(summary.vatCdf)}</span>
                <span className="text-emerald-700 font-semibold">TOTAL EN CDF</span><span className="text-right font-bold text-emerald-700">{money(summary.totalCdf)}</span>
              </>)}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={resetForm} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving...' : quotationId ? 'Update Quotation' : 'Save Quotation'}</button>
          </div>
        </div>
        )}
      </div>

      {/* list */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-800 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> Quotations List</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9 text-sm w-64" placeholder="Search ref or client..." value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th><th>Ref</th><th>Client</th><th>Date</th><th>Kind</th>
                <th className="text-right">Total USD</th><th className="text-right">Total CDF</th><th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">No quotations found.</td></tr>)}
              {paged.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium text-primary-700">{r.quotation_ref}</td>
                  <td>{r.client_code || <span className="text-slate-300">—</span>}</td>
                  <td className="text-xs text-slate-600">{fmtDate(r.quotation_date)}</td>
                  <td>{r.kind_name ? <span className="inline-block rounded bg-cyan-100 text-cyan-800 px-2 py-0.5 text-[11px]">{r.kind_name}</span> : '—'}</td>
                  <td className="text-right font-semibold text-primary-700">{r.total_amount ? `${money(Number(r.total_amount))} USD` : '—'}</td>
                  <td className="text-right text-emerald-700">{r.total_amount_cdf && Number(r.total_amount_cdf) > 0 ? `${money(Number(r.total_amount_cdf))} CDF` : '—'}</td>
                  <td>
                    <div className="inline-flex rounded-md shadow-sm overflow-hidden w-full justify-center">
                      <button type="button" onClick={() => loadForEdit(r.id)} title="Edit" className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => loadForEdit(r.id, true)} title="Copy" className="inline-flex items-center justify-center w-7 h-7 bg-sky-600 hover:bg-sky-700 text-white"><Copy className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => del(r.id)} title="Delete" className="inline-flex items-center justify-center w-7 h-7 bg-red-600 hover:bg-red-700 text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationFooter page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalRows={totalRows} totalPages={totalPages} startIndex={startIndex} mounted={mounted} />
      </div>
    </DashboardShell>
  );
}
