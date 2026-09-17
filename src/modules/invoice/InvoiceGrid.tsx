'use client';

// §2 step 5 — the custom invoice grid (main's calculation UI). Renders BELOW the
// transaction-pages header on /export-invoices/[id] and /import-invoices/[id].
// It owns the MCA-detail + line-item children; the header (client, refs, dates,
// financials) is owned by TransactionalPage. Save posts to
// /api/v1/{kind}-invoices/[id]/grid, which recomputes header totals.
//
// Totals here are BASIC (sum of qty·taux, 16% TVA when flagged). Client-specific
// special-item rules are deferred — see the module notes in the schema files.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw, Loader2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';

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

/** What the EMBEDDED grid holds as its form value. */
export interface InvoiceGridValue {
  quotation_id: number | null;
  items: GridItem[];
  mcaDetails: GridMca[];
}

interface InvoiceGridProps {
  kind: Kind;
  /** 0 or NaN while creating — the embedded grid works without a saved row. */
  invoiceId: number;
  /**
   * Present ⇒ EMBEDDED inside the transaction page: the value is lifted into the
   * page's form state, the grid's own Save disappears, and the page's single
   * Save writes header and children in one transaction (§4.17).
   *
   * Absent ⇒ standalone, owning its own load and save against
   * `/{kind}-invoices/{id}/grid`. That mode is what every caller used before the
   * grid moved into the form, and the endpoint still serves API-only callers.
   */
  value?: InvoiceGridValue;
  onChange?: (value: InvoiceGridValue) => void;
  readonly?: boolean;
  /** The client chosen on the header accordion — scopes both pickers. */
  clientId?: number | null;
}

export default function InvoiceGrid({
  kind,
  invoiceId,
  value,
  onChange,
  readonly: readonlyProp,
  clientId,
}: InvoiceGridProps) {
  const embedded = typeof onChange === 'function';
  const savedId = Number.isInteger(invoiceId) && invoiceId > 0 ? invoiceId : null;
  const base = `/api/v1/${kind}-invoices/${savedId ?? 0}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GridData | null>(null);
  const [ownItems, setOwnItems] = useState<GridItem[]>([]);
  const [ownMca, setOwnMca] = useState<GridMca[]>([]);
  const [ownQuotationId, setOwnQuotationId] = useState<string>('');
  const [addMcaId, setAddMcaId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Embedded, the three editable collections live in the page's form state, so
  // every edit must go back out through `onChange` rather than into local state —
  // otherwise the page's Save would write what it was last told, not what is on
  // screen, and its dirty tracking would never notice a change.
  //
  // Memoised, and that is not a micro-optimisation: `setItems` and `setMca`
  // below close over these, and every callback that calls a setter lists it as a
  // dependency. A fresh array identity on each render would rebuild that whole
  // chain each time, and a HANDLER that did not rebuild would keep a setter
  // closed over a stale `value` — so a second quick edit would be written on top
  // of the first one's starting state and silently lose it.
  const items = useMemo(
    () => (embedded ? (value?.items ?? []) : ownItems),
    [embedded, value?.items, ownItems],
  );
  const mca = useMemo(
    () => (embedded ? (value?.mcaDetails ?? []) : ownMca),
    [embedded, value?.mcaDetails, ownMca],
  );
  const quotationId = embedded
    ? value?.quotation_id == null ? '' : String(value.quotation_id)
    : ownQuotationId;

  // The LATEST value, read at call time. The setters below are what every edit
  // handler depends on, so they must not capture a value that a sibling edit has
  // already superseded.
  const latest = useRef<InvoiceGridValue>({ quotation_id: null, items: [], mcaDetails: [] });
  // Synced in an effect, not during render: a ref written while rendering is a
  // value React may never commit. Every reader below is an event handler, which
  // runs after commit, so the effect has always landed by then.
  useEffect(() => {
    latest.current = {
      quotation_id: value?.quotation_id ?? null,
      items: value?.items ?? [],
      mcaDetails: value?.mcaDetails ?? [],
    };
  }, [value]);

  const emit = useCallback(
    (next: Partial<InvoiceGridValue>) => {
      const merged = { ...latest.current, ...next };
      // Advanced immediately, not left to the effect: two setters called from
      // one handler both run before React re-renders, so without this the second
      // would compose against the pre-edit value and drop the first's change.
      latest.current = merged;
      onChange?.(merged);
    },
    [onChange],
  );

  const setItems = useCallback(
    (update: GridItem[] | ((prev: GridItem[]) => GridItem[])) => {
      if (!embedded) { setOwnItems(update); return; }
      emit({ items: typeof update === 'function' ? update(latest.current.items) : update });
    },
    [embedded, emit],
  );

  const setMca = useCallback(
    (update: GridMca[] | ((prev: GridMca[]) => GridMca[])) => {
      if (!embedded) { setOwnMca(update); return; }
      emit({ mcaDetails: typeof update === 'function' ? update(latest.current.mcaDetails) : update });
    },
    [embedded, emit],
  );

  const setQuotationId = useCallback(
    (next: string) => {
      if (!embedded) { setOwnQuotationId(next); return; }
      emit({ quotation_id: next ? Number(next) : null });
    },
    [embedded, emit],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Embedded: the VALUE comes from the page, so only the pickers are fetched —
    // and they are scoped to the client, which is what lets the grid work on a
    // brand-new invoice that has no row to read from yet.
    if (embedded) {
      const res = await safeFetchJson<{
        clientQuotations: GridData['clientQuotations'];
        availableMcas: GridData['availableMcas'];
      }>(`/api/v1/invoice-grid-pickers?kind=${kind}${clientId ? `&client_id=${clientId}` : ''}`);
      if (!res.ok) {
        setError(res.message);
        setLoading(false);
        return;
      }
      setData({
        header: { id: savedId ?? 0, client_id: clientId ?? null, license_id: null, validated: 0 },
        items: [],
        mcaDetails: [],
        clientQuotations: res.data.clientQuotations,
        availableMcas: res.data.availableMcas,
      });
      setLoading(false);
      return;
    }

    const res = await safeFetchJson<GridData>(`${base}/grid`);
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setData(res.data);
    setOwnItems(res.data.items.map(recompute));
    setOwnMca(res.data.mcaDetails);
    setLoading(false);
  }, [base, embedded, kind, clientId, savedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (embedded || savedId !== null) void load();
  }, [load, embedded, savedId]);

  const readonly = readonlyProp ?? (data?.header.validated ?? 0) >= 1;

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
        // §4.19 — an option label is a date the operator reads, so it carries
        // the house format like every other one.
        label: `${qq.quotation_ref}${qq.quotation_date ? ` (${formatDate(qq.quotation_date)})` : ''}`,
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
  }, [quotationId, setItems]);

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
  }, [addMcaId, kind, mca.length, setMca]);

  const removeMca = useCallback((idx: number) => {
    setMca((prev) => prev.filter((_, i) => i !== idx));
  }, [setMca]);

  const patchItem = useCallback((idx: number, patch: Partial<GridItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? recompute({ ...it, ...patch }) : it)));
  }, [setItems]);

  const patchMca = useCallback((idx: number, patch: Partial<GridMca>) => {
    setMca((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }, [setMca]);

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
  }, [setItems]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, [setItems]);

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

      {/* §4.17 — EMBEDDED, this grid has no Save of its own: the page's single
          Save writes the header and these children in one transaction. A second
          Save here is the defect this move exists to remove — two controls
          writing the same invoice, where saving one silently discarded the
          other's edits, and neither existed at all on /new. */}
      {!embedded && !readonly && (
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
