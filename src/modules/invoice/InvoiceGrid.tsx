'use client';

// §2 step 5 — the custom invoice grid (main's calculation UI). Renders BELOW the
// transaction-pages header on /export-invoices/[id] and /import-invoices/[id].
// It owns the MCA-detail + line-item children; the header (client, refs, dates,
// financials) is owned by TransactionalPage. Save posts to
// /api/v1/{kind}-invoices/[id]/grid, which recomputes header totals.
//
// Totals here are BASIC (sum of qty·taux, 16% TVA when flagged). Client-specific
// special-item rules are deferred — see the module notes in the schema files.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw, Loader2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';

type Kind = 'export' | 'import';

interface GridItem {
  id?: number;
  quotation_item_id: number | null;
  category_id: number | null;
  category_name: string | null;
  category_header: string | null;
  display_order: number;
  item_id: number | null;
  item_name: string | null;
  unit_id: number | null;
  unit_text: string | null;
  quantity: number;
  taux_usd: number;
  cost_usd: number;
  currency_id: number | null;
  has_tva: number;
  tva_usd: number;
  subtotal_usd: number;
  total_usd: number;
}

interface GridMca {
  id?: number;
  mca_id: number | null;
  display_order: number;
  lot_number: string | null;
  declaration_no: string | null;
  declaration_date: string | null;
  liquidation_no: string | null;
  liquidation_date: string | null;
  liquidation_amount: number;
  liquidation_usd: number;
  quittance_no: string | null;
  quittance_date: string | null;
  horse: string | null;
  trailer_1: string | null;
  trailer_2: string | null;
  container: string | null;
  weight: number;
  buyer: string | null;
  ceec_amount: number;
  cgea_amount: number;
  occ_amount: number;
  lmc_amount: number;
  ogefrem_amount: number;
}

interface GridData {
  header: { id: number; client_id: number | null; license_id: number | null; validated: number };
  items: GridItem[];
  mcaDetails: GridMca[];
  clientQuotations: { id: number; quotation_ref: string; quotation_date: string | null }[];
  availableMcas: { id: number; mca_ref: string | null; label: string }[];
}

const money = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number): number => Math.round(n * 100) / 100;

function recompute(it: GridItem): GridItem {
  const subtotal = round2(it.quantity * it.taux_usd);
  const tva = it.has_tva ? round2(subtotal * 0.16) : 0;
  return { ...it, subtotal_usd: subtotal, tva_usd: tva, total_usd: round2(subtotal + tva) };
}

export default function InvoiceGrid({ kind, invoiceId }: { kind: Kind; invoiceId: number }) {
  const base = `/api/v1/${kind}-invoices/${invoiceId}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GridData | null>(null);
  const [items, setItems] = useState<GridItem[]>([]);
  const [mca, setMca] = useState<GridMca[]>([]);
  const [quotationId, setQuotationId] = useState<string>('');
  const [addMcaId, setAddMcaId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await safeFetchJson<GridData>(`${base}/grid`);
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setData(res.data);
    setItems(res.data.items.map(recompute));
    setMca(res.data.mcaDetails);
    setLoading(false);
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isInteger(invoiceId) && invoiceId > 0) void load();
  }, [load, invoiceId]);

  const readonly = (data?.header.validated ?? 0) >= 1;

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((s, it) => s + it.subtotal_usd, 0));
    const tva = round2(items.reduce((s, it) => s + it.tva_usd, 0));
    const weight = round2(mca.reduce((s, m) => s + (m.weight || 0), 0));
    return { subtotal, tva, total: round2(subtotal + tva), weight };
  }, [items, mca]);

  const mcaOptions = useMemo(() => {
    const used = new Set(mca.map((m) => m.mca_id));
    return (data?.availableMcas ?? [])
      .filter((m) => !used.has(m.id))
      .map((m) => ({ value: String(m.id), label: m.label }));
  }, [data, mca]);

  const quotationOptions = useMemo(
    () =>
      (data?.clientQuotations ?? []).map((qq) => ({
        value: String(qq.id),
        label: `${qq.quotation_ref}${qq.quotation_date ? ` (${qq.quotation_date})` : ''}`,
      })),
    [data],
  );

  const loadQuotationItems = useCallback(async () => {
    const id = Number(quotationId);
    if (!Number.isInteger(id) || id <= 0) return;
    setNotice(null);
    const res = await safeFetchJson<GridItem[]>(`/api/v1/invoice-quotation-items?quotation_id=${id}`);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setItems(res.data.map(recompute));
    setNotice(`Loaded ${res.data.length} item(s) from quotation.`);
  }, [quotationId]);

  const addMca = useCallback(async () => {
    const id = Number(addMcaId);
    if (!Number.isInteger(id) || id <= 0) return;
    let row: GridMca = {
      mca_id: id,
      display_order: mca.length,
      lot_number: null, declaration_no: null, declaration_date: null,
      liquidation_no: null, liquidation_date: null, liquidation_amount: 0, liquidation_usd: 0,
      quittance_no: null, quittance_date: null,
      horse: null, trailer_1: null, trailer_2: null, container: null,
      weight: 0, buyer: null,
      ceec_amount: 0, cgea_amount: 0, occ_amount: 0, lmc_amount: 0, ogefrem_amount: 0,
    };
    // Export MCAs prefill their detail columns from the source export_t row.
    if (kind === 'export') {
      const res = await safeFetchJson<Partial<GridMca>>(`/api/v1/export-invoices/mca-prefill?mca_id=${id}`);
      if (res.ok) row = { ...row, ...res.data, mca_id: id };
    }
    setMca((prev) => [...prev, row]);
    setAddMcaId('');
  }, [addMcaId, kind, mca.length]);

  const removeMca = useCallback((idx: number) => {
    setMca((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const patchItem = useCallback((idx: number, patch: Partial<GridItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? recompute({ ...it, ...patch }) : it)));
  }, []);

  const patchMca = useCallback((idx: number, patch: Partial<GridMca>) => {
    setMca((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }, []);

  const addBlankItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      recompute({
        quotation_item_id: null, category_id: null, category_name: null, category_header: null,
        display_order: prev.length, item_id: null, item_name: '', unit_id: null, unit_text: null,
        quantity: 1, taux_usd: 0, cost_usd: 0, currency_id: null, has_tva: 0,
        tva_usd: 0, subtotal_usd: 0, total_usd: 0,
      }),
    ]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    const res = await safeFetchJson<{ total_usd: number }>(`${base}/grid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quotation_id: quotationId ? Number(quotationId) : null,
        mcaDetails: mca,
        items,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setNotice('Saved. Totals updated on the invoice header.');
    void load();
  }, [base, quotationId, mca, items, load]);

  const mcaLabel = useCallback(
    (id: number | null) => data?.availableMcas.find((m) => m.id === id)?.label ?? (id ? `MCA #${id}` : '—'),
    [data],
  );

  if (loading) {
    return <div className="card mt-6 p-6 text-center text-muted-foreground">Loading invoice grid…</div>;
  }
  if (error) {
    return (
      <div className="card mt-6 p-4 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
        Grid unavailable: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      {readonly && (
        <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          This invoice is validated and is read-only.
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-300">{notice}</div>
      )}

      {/* MCA references */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">MCA References</h2>
          {!readonly && (
            <div className="flex items-center gap-2">
              <div className="w-72">
                <SearchableSelect
                  value={addMcaId}
                  onChange={setAddMcaId}
                  options={mcaOptions}
                  placeholder="Select MCA to add…"
                />
              </div>
              <button
                type="button"
                onClick={addMca}
                disabled={!addMcaId}
                className="btn-primary inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Weight</th>
                {kind === 'export' && (
                  <>
                    <th>Liquidation</th>
                    <th>CEEC</th>
                    <th>CGEA</th>
                    <th>OCC</th>
                    <th>LMC</th>
                    <th>OGEFREM</th>
                  </>
                )}
                {!readonly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {mca.length === 0 && (
                <tr>
                  <td colSpan={kind === 'export' ? 9 : 3} className="py-4 text-center text-muted-foreground">
                    No MCA references selected.
                  </td>
                </tr>
              )}
              {mca.map((m, idx) => (
                <tr key={m.id ?? `new-${idx}`}>
                  <td>{mcaLabel(m.mca_id)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      value={m.weight}
                      disabled={readonly}
                      onChange={(e) => patchMca(idx, { weight: Number(e.target.value) })}
                      className="input w-24"
                    />
                  </td>
                  {kind === 'export' && (
                    <>
                      <td>
                        <input type="number" step="0.01" value={m.liquidation_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { liquidation_amount: Number(e.target.value) })}
                          className="input w-28" />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={m.ceec_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { ceec_amount: Number(e.target.value) })} className="input w-24" />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={m.cgea_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { cgea_amount: Number(e.target.value) })} className="input w-24" />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={m.occ_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { occ_amount: Number(e.target.value) })} className="input w-24" />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={m.lmc_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { lmc_amount: Number(e.target.value) })} className="input w-24" />
                      </td>
                      <td>
                        <input type="number" step="0.01" value={m.ogefrem_amount} disabled={readonly}
                          onChange={(e) => patchMca(idx, { ogefrem_amount: Number(e.target.value) })} className="input w-24" />
                      </td>
                    </>
                  )}
                  {!readonly && (
                    <td>
                      <button type="button" onClick={() => removeMca(idx)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Line items */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Invoice Items</h2>
          {!readonly && (
            <div className="flex items-center gap-2">
              <div className="w-64">
                <SearchableSelect
                  value={quotationId}
                  onChange={setQuotationId}
                  options={quotationOptions}
                  placeholder="Pick quotation…"
                />
              </div>
              <button type="button" onClick={loadQuotationItems} disabled={!quotationId}
                className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50">
                <RefreshCw className="h-4 w-4" /> Load items
              </button>
              <button type="button" onClick={addBlankItem} className="btn-secondary inline-flex items-center gap-1">
                <Plus className="h-4 w-4" /> Row
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th>Category</th>
                <th>Item</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Taux (USD)</th>
                <th>TVA?</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right">TVA</th>
                <th className="text-right">Total</th>
                {!readonly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={readonly ? 9 : 10} className="py-4 text-center text-muted-foreground">
                    No items. Load from a quotation or add a row.
                  </td>
                </tr>
              )}
              {items.map((it, idx) => (
                <tr key={it.id ?? `new-${idx}`}>
                  <td className="text-muted-foreground">{it.category_header ?? it.category_name ?? '—'}</td>
                  <td>
                    <input value={it.item_name ?? ''} disabled={readonly}
                      onChange={(e) => patchItem(idx, { item_name: e.target.value })} className="input min-w-[12rem]" />
                  </td>
                  <td className="text-muted-foreground">{it.unit_text ?? '—'}</td>
                  <td>
                    <input type="number" step="0.001" value={it.quantity} disabled={readonly}
                      onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) })} className="input w-20" />
                  </td>
                  <td>
                    <input type="number" step="0.0001" value={it.taux_usd} disabled={readonly}
                      onChange={(e) => patchItem(idx, { taux_usd: Number(e.target.value) })} className="input w-28" />
                  </td>
                  <td className="text-center">
                    <Toggle size="sm" checked={!!it.has_tva} disabled={readonly}
                      aria-label={`TVA on line ${idx + 1}`}
                      onChange={(v) => patchItem(idx, { has_tva: v ? 1 : 0 })} />
                  </td>
                  <td className="text-right tabular-nums">{money(it.subtotal_usd)}</td>
                  <td className="text-right tabular-nums">{money(it.tva_usd)}</td>
                  <td className="text-right font-medium tabular-nums">{money(it.total_usd)}</td>
                  {!readonly && (
                    <td>
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={6} className="text-right">Totals (USD)</td>
                <td className="text-right tabular-nums">{money(totals.subtotal)}</td>
                <td className="text-right tabular-nums">{money(totals.tva)}</td>
                <td className="text-right tabular-nums">{money(totals.total)}</td>
                {!readonly && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Total weight: <span className="font-medium tabular-nums">{money(totals.weight)}</span>
        </div>
      </div>

      {!readonly && (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Grid
          </button>
        </div>
      )}
    </div>
  );
}
