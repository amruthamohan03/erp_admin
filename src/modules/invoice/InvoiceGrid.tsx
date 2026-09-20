'use client';

// §2 step 5 — an invoice's MCA files and priced lines, rendered INSIDE the
// transaction page by FieldRenderer (`field_type: 'invoice-grid'`). The page's
// single Save writes the header and these rows in one transaction (§4.17); this
// component holds no Save of its own and no state the page cannot see.
//
// Laid out as main's two invoice screens:
//
//   Export — "MCA References": one editable row per file (lot, declaration,
//            liquidation, DGDA rate, quittance, truck, weight, buyer and the five
//            government charges), a DGDA rate applied to every file at once, and
//            Liquidation USD = CDF ÷ that file's rate. Items priced per file
//            count or per tonne, with a clearing-cost total.
//
//   Import — the files picked by reference, and the quotation's lines grouped by
//            category. The customs category is billed in CDF (CIF/Split, %,
//            Rate, VAT, Total) and can be hidden from the invoice; every other
//            category is qty × rate in USD.
//
// Picking files fills the header — kind, goods and transport; for Import also
// FOB, freight, weight, duty, the truck and the customs references — and
// auto-selects the quotation main would have chosen. That round trip is
// `/api/v1/invoice-mca-header`, and the header fields are written through the
// page's own change path (`onHeaderPatch`), never around it.
//
// Every figure shown here is recomputed by the server on save (`computeGrid`);
// nothing typed into a total is trusted.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, ListPlus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';
import { fetchMasterOptions } from '@/lib/selectOptions';

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
  cif_split: number;
  percentage: number;
  rate_cdf: number;
  vat_cdf: number;
  total_cdf: number;
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
  bcc_rate: number;
  feet_container_id: number | null;
  ceec_amount: number;
  cgea_amount: number;
  occ_amount: number;
  lmc_amount: number;
  ogefrem_amount: number;
}

/** What the grid holds as its form value. */
export interface InvoiceGridValue {
  quotation_id: number | null;
  items: GridItem[];
  mcaDetails: GridMca[];
  /** Import — the customs (CDF) category shown ('S') or hidden ('H'). */
  first_categoty_edited?: 'H' | 'S';
}

/** An MCA file the pickers offer. Import files carry their licence. */
export interface PickerMca {
  id: number;
  mca_ref: string | null;
  label: string;
  license_id?: number | null;
  license_number?: string | null;
  detail?: string;
}

export interface Pickers {
  clientQuotations: { id: number; quotation_ref: string; quotation_date: string | null }[];
  availableMcas: PickerMca[];
}

interface InvoiceGridProps {
  kind: Kind;
  /** 0 while creating — the grid works before the invoice has a row. */
  invoiceId: number;
  value: InvoiceGridValue;
  onChange: (value: InvoiceGridValue) => void;
  readonly?: boolean;
  clientId?: number | null;
  /** Export — the header's licence; the file picker lists its files only. */
  licenseId?: number | null;
  /** Import — the DGDA rate the customs category's CDF converts to USD at. */
  dgdaRate?: number;
  /** Write header fields the chosen files determine. */
  onHeaderPatch?: (patch: Record<string, unknown>) => void;
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** One line's computed columns — the same arithmetic `computeGrid` stores. */
function recompute(it: GridItem): GridItem {
  const subtotal = round2(it.quantity * it.taux_usd);
  const tva = it.has_tva ? round2(subtotal * 0.16) : 0;
  return {
    ...it,
    subtotal_usd: subtotal,
    tva_usd: tva,
    total_usd: round2(subtotal + tva),
    total_cdf: round2(it.rate_cdf + it.vat_cdf),
  };
}

/** main's updateCifSplit: CIF/Split = Rate(CDF) × 100 ÷ %, blank without a %. */
const cifSplitOf = (rateCdf: number, pct: number): number => (pct > 0 ? round2((rateCdf * 100) / pct) : 0);

const EXPORT_MCA_COLUMNS: {
  key: keyof GridMca;
  label: string;
  type: 'text' | 'date' | 'number';
  step?: string;
  width: string;
}[] = [
  { key: 'lot_number', label: 'Lot Number', type: 'text', width: 'w-28' },
  { key: 'declaration_no', label: 'Declaration No', type: 'text', width: 'w-28' },
  { key: 'declaration_date', label: 'Declaration Date', type: 'date', width: 'w-36' },
  { key: 'liquidation_no', label: 'Liquidation No', type: 'text', width: 'w-28' },
  { key: 'liquidation_date', label: 'Liquidation Date', type: 'date', width: 'w-36' },
  { key: 'bcc_rate', label: 'DGDA Rate', type: 'number', step: '0.01', width: 'w-24' },
  { key: 'liquidation_amount', label: 'Liquidation CDF', type: 'number', step: '0.01', width: 'w-32' },
  // Liquidation USD sits here, computed — see the row renderer.
  { key: 'quittance_no', label: 'Quittance No', type: 'text', width: 'w-28' },
  { key: 'quittance_date', label: 'Quittance Date', type: 'date', width: 'w-36' },
  { key: 'horse', label: 'Horse', type: 'text', width: 'w-24' },
  { key: 'trailer_1', label: 'Trailer 1', type: 'text', width: 'w-24' },
  { key: 'trailer_2', label: 'Trailer 2', type: 'text', width: 'w-24' },
  { key: 'container', label: 'Container', type: 'text', width: 'w-28' },
  { key: 'weight', label: 'Weight (MT)', type: 'number', step: '0.001', width: 'w-24' },
  { key: 'buyer', label: 'Buyer', type: 'text', width: 'w-32' },
  { key: 'ceec_amount', label: 'CEEC (CDF)', type: 'number', step: '0.01', width: 'w-24' },
  { key: 'cgea_amount', label: 'CGEA (CDF)', type: 'number', step: '0.01', width: 'w-24' },
  { key: 'occ_amount', label: 'OCC (CDF)', type: 'number', step: '0.01', width: 'w-24' },
  { key: 'lmc_amount', label: 'LMC (CDF)', type: 'number', step: '0.01', width: 'w-24' },
  { key: 'ogefrem_amount', label: 'OGEFREM (CDF)', type: 'number', step: '0.01', width: 'w-24' },
];

export function emptyMca(mcaId: number, order: number): GridMca {
  return {
    mca_id: mcaId,
    display_order: order,
    lot_number: null, declaration_no: null, declaration_date: null,
    liquidation_no: null, liquidation_date: null, liquidation_amount: 0, liquidation_usd: 0,
    quittance_no: null, quittance_date: null,
    horse: null, trailer_1: null, trailer_2: null, container: null,
    weight: 0, buyer: null, bcc_rate: 0, feet_container_id: null,
    ceec_amount: 0, cgea_amount: 0, occ_amount: 0, lmc_amount: 0, ogefrem_amount: 0,
  };
}

/** A line loaded from a quotation, with every numeric column defaulted. */
function normaliseItem(raw: Partial<GridItem>): GridItem {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return recompute({
    quotation_item_id: raw.quotation_item_id ?? null,
    category_id: raw.category_id ?? null,
    category_name: raw.category_name ?? null,
    category_header: raw.category_header ?? null,
    display_order: n(raw.display_order),
    item_id: raw.item_id ?? null,
    item_name: raw.item_name ?? null,
    unit_id: raw.unit_id ?? null,
    unit_text: raw.unit_text ?? null,
    quantity: n(raw.quantity),
    taux_usd: n(raw.taux_usd),
    cost_usd: n(raw.cost_usd),
    currency_id: raw.currency_id ?? null,
    has_tva: n(raw.has_tva) ? 1 : 0,
    tva_usd: 0,
    subtotal_usd: 0,
    total_usd: 0,
    cif_split: n(raw.cif_split),
    percentage: n(raw.percentage),
    rate_cdf: n(raw.rate_cdf),
    vat_cdf: n(raw.vat_cdf),
    total_cdf: 0,
  });
}

export default function InvoiceGrid({
  kind,
  invoiceId,
  value,
  onChange,
  readonly = false,
  clientId,
  licenseId,
  dgdaRate = 0,
  onHeaderPatch,
}: InvoiceGridProps) {
  const savedId = Number.isInteger(invoiceId) && invoiceId > 0 ? invoiceId : null;
  const [pickers, setPickers] = useState<Pickers>({ clientQuotations: [], availableMcas: [] });
  const [customsCats, setCustomsCats] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addMcaId, setAddMcaId] = useState('');
  const [commonRate, setCommonRate] = useState('');
  // Import — currency short names for the lines' CURRENCY column (main shows
  // it beside TAUX/USD). Read from the currency master, never hardcoded.
  const [currencyNames, setCurrencyNames] = useState<Map<number, string>>(new Map());
  // main's "Hide Zeros": zero-value liquidation lines leave the invoice while
  // hidden — main drops them from the save — and come back on "Show All". The
  // stash keeps each one's position so restoring does not reorder the table.
  const [zeroStash, setZeroStash] = useState<{ idx: number; it: GridItem }[] | null>(null);

  const items = useMemo(() => (Array.isArray(value.items) ? value.items : []), [value.items]);
  const mca = useMemo(() => (Array.isArray(value.mcaDetails) ? value.mcaDetails : []), [value.mcaDetails]);
  const quotationId = value.quotation_id == null ? '' : String(value.quotation_id);
  const customsShown = (value.first_categoty_edited ?? 'S') !== 'H';

  // The LATEST value, read at call time, so two edits made before React
  // re-renders compose instead of the second overwriting the first.
  const latest = useRef<InvoiceGridValue>(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const emit = useCallback(
    (next: Partial<InvoiceGridValue>) => {
      const merged = { ...latest.current, ...next };
      latest.current = merged;
      onChange(merged);
    },
    [onChange],
  );

  const setItems = useCallback(
    (update: (prev: GridItem[]) => GridItem[]) => emit({ items: update(latest.current.items ?? []) }),
    [emit],
  );
  const setMca = useCallback(
    (update: (prev: GridMca[]) => GridMca[]) => emit({ mcaDetails: update(latest.current.mcaDetails ?? []) }),
    [emit],
  );

  // ---- pickers + which categories are billed in CDF ----------------------
  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      const p = new URLSearchParams({ kind });
      if (clientId) p.set('client_id', String(clientId));
      if (kind === 'export' && licenseId) p.set('license_id', String(licenseId));
      if (savedId) p.set('invoice_id', String(savedId));
      const [res, cats] = await Promise.all([
        safeFetchJson<Pickers>(`/api/v1/invoice-grid-pickers?${p}`),
        safeFetchJson<unknown>('/api/v1/quotation-categories?pageSize=100'),
      ]);
      if (!live) return;
      if (!res.ok) {
        setError(res.message);
        setLoading(false);
        return;
      }
      setError(null);
      setPickers(res.data);
      if (cats.ok) {
        const raw = cats.data as { items?: unknown } | unknown[];
        const list = (Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []) as {
          id: number;
          is_customs?: boolean;
        }[];
        setCustomsCats(new Set(list.filter((c) => c.is_customs === true).map((c) => Number(c.id))));
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [kind, clientId, licenseId, savedId]);

  useEffect(() => {
    if (kind !== 'import') return;
    let live = true;
    void fetchMasterOptions('currencies', 'currency_short_name').then((rows) => {
      if (live) setCurrencyNames(new Map(rows.map((r) => [Number(r.id), r.label])));
    });
    return () => {
      live = false;
    };
  }, [kind]);

  /** Import's CDF columns apply to the customs category only. */
  const isCdf = useCallback(
    (it: GridItem) => kind === 'import' && it.category_id != null && customsCats.has(it.category_id),
    [kind, customsCats],
  );

  // ---- loading a quotation's lines --------------------------------------
  const loadQuotationItems = useCallback(
    async (id: number, files: GridMca[]) => {
      const res = await safeFetchJson<Partial<GridItem>[]>(`/api/v1/invoice-quotation-items?quotation_id=${id}`);
      if (!res.ok) {
        setNotice(res.message);
        return;
      }
      let lines = res.data.map(normaliseItem);
      if (kind === 'export') lines = applyExportUnits(lines, files);
      // Fresh lines replace the table, so nothing stashed belongs to it any more.
      setZeroStash(null);
      emit({ quotation_id: id, items: lines });
      setNotice(`Loaded ${lines.length} line(s) from the quotation.`);
    },
    [emit, kind],
  );

  // ---- files changed: fill the header, match a quotation ----------------
  const onFilesChanged = useCallback(
    async (files: GridMca[]) => {
      const ids = files.map((m) => m.mca_id).filter((v): v is number => typeof v === 'number');
      if (!clientId || ids.length === 0) return;
      const res = await safeFetchJson<{ patch: Record<string, unknown>; quotation_id: number | null }>(
        `/api/v1/invoice-mca-header?kind=${kind}&client_id=${clientId}&mca_ids=${ids.join(',')}`,
      );
      if (!res.ok) {
        setNotice(res.message);
        return;
      }
      if (onHeaderPatch && Object.keys(res.data.patch).length > 0) onHeaderPatch(res.data.patch);
      // main auto-selected the quotation on the first files picked; an operator
      // who has already chosen one keeps theirs.
      if (res.data.quotation_id && latest.current.quotation_id == null) {
        await loadQuotationItems(res.data.quotation_id, files);
      } else if (kind === 'export') {
        setItems((prev) => applyExportUnits(prev, files));
      }
    },
    [clientId, kind, onHeaderPatch, loadQuotationItems, setItems],
  );

  // Import picks its files in the HEADER (InvoiceFilesPicker — Client, then
  // licences, then their MCA references, as main laid it out), which writes
  // `mcaDetails` straight into this field's value. The consequences of a new
  // file set — header fields filled from the files, the matching quotation
  // loaded — are still the grid's job, so it watches the set and runs the same
  // `onFilesChanged` its own picker used to. The first set it sees is the one
  // the record was opened with, and is not re-applied: re-opening an invoice
  // must not overwrite what was saved.
  const mcaKey = kind === 'import' ? mca.map((m) => m.mca_id).join(',') : '';
  const seenMcaKey = useRef<string | null>(null);
  useEffect(() => {
    if (kind !== 'import') return;
    if (seenMcaKey.current === null) {
      seenMcaKey.current = mcaKey;
      return;
    }
    if (seenMcaKey.current === mcaKey) return;
    seenMcaKey.current = mcaKey;
    void onFilesChanged(latest.current.mcaDetails ?? []);
  }, [kind, mcaKey, onFilesChanged]);

  const addFiles = useCallback(
    async (ids: number[]) => {
      const fresh = ids.filter((id) => !latest.current.mcaDetails?.some((m) => m.mca_id === id));
      if (fresh.length === 0) return;
      const base = latest.current.mcaDetails ?? [];
      const rows: GridMca[] = [];
      for (const [i, id] of fresh.entries()) {
        let row = emptyMca(id, base.length + i);
        // An export file's row is prefilled from its tracking record, and takes
        // the common DGDA rate when one has been set — main's getMCADetails.
        if (kind === 'export') {
          const res = await safeFetchJson<Partial<GridMca>>(`/api/v1/export-invoices/mca-prefill?mca_id=${id}`);
          if (res.ok) row = { ...row, ...res.data, mca_id: id };
          const rate = num(commonRate);
          if (rate > 0) row.bcc_rate = rate;
        }
        rows.push(row);
      }
      const next = [...base, ...rows];
      setMca(() => next);
      setAddMcaId('');
      await onFilesChanged(next);
    },
    [kind, commonRate, setMca, onFilesChanged],
  );

  const removeFile = useCallback(
    async (idx: number) => {
      const next = (latest.current.mcaDetails ?? []).filter((_, i) => i !== idx);
      setMca(() => next);
      await onFilesChanged(next);
    },
    [setMca, onFilesChanged],
  );

  const patchMca = useCallback(
    (idx: number, change: Partial<GridMca>) => {
      setMca((prev) =>
        prev.map((m, i) => {
          if (i !== idx) return m;
          const next = { ...m, ...change };
          return {
            ...next,
            liquidation_usd: next.bcc_rate > 0 ? round2(next.liquidation_amount / next.bcc_rate) : 0,
          };
        }),
      );
      // Weight moves every per-tonne line's quantity (main's updateAllItemUnits).
      if (kind === 'export' && 'weight' in change) {
        setItems((prev) => applyExportUnits(prev, latest.current.mcaDetails ?? []));
      }
    },
    [kind, setMca, setItems],
  );

  /** main's "Apply to All Selected": one DGDA rate onto every file. */
  const applyCommonRate = useCallback(() => {
    const rate = num(commonRate);
    if (rate <= 0) {
      setNotice('Enter a DGDA rate greater than 0 to apply it to every file.');
      return;
    }
    setMca((prev) =>
      prev.map((m) => ({ ...m, bcc_rate: rate, liquidation_usd: round2(m.liquidation_amount / rate) })),
    );
    setNotice(`DGDA rate ${rate.toFixed(2)} applied to ${mca.length} file(s).`);
  }, [commonRate, mca.length, setMca]);

  const patchItem = useCallback(
    (idx: number, change: Partial<GridItem>) => {
      setItems((prev) =>
        prev.map((it, i) => {
          if (i !== idx) return it;
          let next = { ...it, ...change };
          // The CDF row's three linked cells, as main keeps them: editing the
          // total moves the rate, and either moves the CIF split.
          if ('total_cdf' in change) next = { ...next, rate_cdf: round2(next.total_cdf - next.vat_cdf) };
          if ('rate_cdf' in change || 'percentage' in change || 'total_cdf' in change) {
            next = { ...next, cif_split: cifSplitOf(next.rate_cdf, next.percentage) };
          }
          return recompute(next);
        }),
      );
    },
    [setItems],
  );

  const removeItem = useCallback((idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx)), [setItems]);

  const isZeroCdf = useCallback((it: GridItem) => isCdf(it) && round2(it.total_cdf) === 0, [isCdf]);

  /** main's Hide Zeros / Show All on the customs category. */
  const toggleZeros = useCallback(() => {
    if (zeroStash) {
      setItems((prev) => {
        const next = [...prev];
        for (const { idx, it } of zeroStash) next.splice(Math.min(idx, next.length), 0, it);
        return next;
      });
      setZeroStash(null);
      return;
    }
    const cur = latest.current.items ?? [];
    const zero = cur.map((it, idx) => ({ it, idx })).filter(({ it }) => isZeroCdf(it));
    if (zero.length === 0) {
      setNotice('No liquidation line totals 0 — nothing to hide.');
      return;
    }
    setItems((prev) => prev.filter((it) => !isZeroCdf(it)));
    setZeroStash(zero);
  }, [zeroStash, isZeroCdf, setItems]);

  const currencyOf = (it: GridItem): string =>
    (it.currency_id != null ? currencyNames.get(it.currency_id) : undefined) ?? 'USD';

  const addBlankItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      normaliseItem({ display_order: prev.length, item_name: '', quantity: 1 }),
    ]);
  }, [setItems]);

  // ---- derived display ---------------------------------------------------
  const mcaOptions = useMemo(() => {
    const used = new Set(mca.map((m) => m.mca_id));
    return pickers.availableMcas.filter((m) => !used.has(m.id)).map((m) => ({ value: String(m.id), label: m.label }));
  }, [pickers, mca]);

  const quotationOptions = useMemo(
    () =>
      pickers.clientQuotations.map((q) => ({
        value: String(q.id),
        label: `${q.quotation_ref}${q.quotation_date ? ` (${formatDate(q.quotation_date)})` : ''}`,
      })),
    [pickers],
  );

  const mcaLabel = useCallback(
    (id: number | null) => pickers.availableMcas.find((m) => m.id === id)?.mca_ref ?? (id ? `MCA #${id}` : '—'),
    [pickers],
  );

  /** Lines grouped by category, in category order, each with its original index. */
  const groups = useMemo(() => {
    const map = new Map<string, { header: string; order: number; cdf: boolean; rows: { it: GridItem; idx: number }[] }>();
    items.forEach((it, idx) => {
      const key = String(it.category_id ?? 'none');
      const g = map.get(key) ?? {
        header: it.category_header || it.category_name || 'Uncategorised',
        order: it.display_order ?? 999,
        cdf: isCdf(it),
        rows: [],
      };
      g.order = Math.min(g.order, it.display_order ?? 999);
      g.rows.push({ it, idx });
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [items, isCdf]);

  const totals = useMemo(() => {
    const usd = items.filter((it) => !isCdf(it));
    const subtotal = round2(usd.reduce((s, it) => s + it.subtotal_usd, 0));
    const tva = round2(usd.reduce((s, it) => s + it.tva_usd, 0));
    const cdf = customsShown ? round2(items.filter(isCdf).reduce((s, it) => s + it.total_cdf, 0)) : 0;
    return {
      subtotal,
      tva,
      total: round2(subtotal + tva),
      cdf,
      cdfUsd: dgdaRate > 0 ? round2(cdf / dgdaRate) : 0,
      weight: round2(mca.reduce((s, m) => s + (m.weight || 0), 0)),
    };
  }, [items, mca, isCdf, customsShown, dgdaRate]);

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-8 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        The MCA files and quotations could not be loaded: {error}
      </div>
    );
  }
  if (!clientId) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Choose a <strong className="text-foreground">Client</strong>
        {kind === 'export' ? ' and a License' : ''} above — the files and quotations offered here are theirs.
      </p>
    );
  }

  const filePicker = !readonly && (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        className="w-72"
        size="sm"
        value={addMcaId}
        onChange={setAddMcaId}
        options={mcaOptions}
        placeholder={mcaOptions.length ? 'Select an MCA file…' : 'No files available to invoice'}
        aria-label="MCA file to add"
      />
      <button
        type="button"
        onClick={() => void addFiles([Number(addMcaId)])}
        disabled={!addMcaId}
        className="btn-primary btn-sm disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Add
      </button>
      <button
        type="button"
        onClick={() => void addFiles(mcaOptions.map((o) => Number(o.value)))}
        disabled={mcaOptions.length === 0}
        className="btn-neutral btn-sm disabled:opacity-50"
        title="Add every file still available to invoice"
      >
        <ListPlus className="h-4 w-4" /> Select all
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          {notice}
        </div>
      )}

      {/* ---- MCA files ------------------------------------------------- */}
      {/* Import picks its files in the header (licences → MCA references). */}
      {kind === 'export' && (
      <section className="rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg bg-muted px-3 py-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            MCA References — Select Files
            {mca.length > 0 && (
              <span className="ms-2 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] text-white">
                {mca.length} selected{kind === 'export' ? ` | ${totals.weight.toFixed(3)} MT` : ''}
              </span>
            )}
          </h4>
          {filePicker}
        </div>

        {kind === 'export' && !readonly && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sky-50 px-3 py-2 dark:bg-sky-500/10">
            <label htmlFor="common-dgda" className="text-xs font-semibold text-sky-800 dark:text-sky-300">
              DGDA Rate:
            </label>
            <input
              id="common-dgda"
              type="number"
              step="0.01"
              min="0"
              value={commonRate}
              onChange={(e) => setCommonRate(e.target.value)}
              placeholder="Enter DGDA rate"
              className="input h-8 w-36 min-w-0 text-right"
            />
            <button type="button" onClick={applyCommonRate} disabled={mca.length === 0} className="btn-neutral btn-sm disabled:opacity-50">
              <Check className="h-4 w-4" /> Apply to All Selected
            </button>
            <span className="ms-auto text-[11px] italic text-sky-700 dark:text-sky-300">
              The DGDA rate converts each file&rsquo;s liquidation to USD; the BCC rate on the header prices the invoice.
            </span>
          </div>
        )}

        {mca.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {kind === 'export' && !licenseId
              ? 'Choose a License above, then select its MCA files.'
              : 'No MCA files selected yet.'}
          </p>
        ) : kind === 'export' ? (
          <div className="max-h-[500px] overflow-auto">
            <table className="table-base whitespace-nowrap text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>MCA Ref</th>
                  {EXPORT_MCA_COLUMNS.flatMap((c) =>
                    // Liquidation USD follows Liquidation CDF, as on main.
                    c.key === 'liquidation_amount'
                      ? [<th key={c.key}>{c.label}</th>, <th key="liq-usd">Liquidation USD</th>]
                      : [<th key={c.key}>{c.label}</th>],
                  )}
                  {!readonly && <th />}
                </tr>
              </thead>
              <tbody>
                {mca.map((m, idx) => (
                  <tr key={m.id ?? `f-${m.mca_id}-${idx}`}>
                    <td className="font-mono font-semibold">{mcaLabel(m.mca_id)}</td>
                    {EXPORT_MCA_COLUMNS.flatMap((c) => {
                      const raw = m[c.key];
                      const cell = (
                        <td key={c.key}>
                          <input
                            type={c.type}
                            step={c.step}
                            disabled={readonly}
                            aria-label={`${c.label} for ${mcaLabel(m.mca_id)}`}
                            value={raw == null ? '' : String(raw)}
                            onChange={(e) =>
                              patchMca(idx, {
                                [c.key]: c.type === 'number' ? num(e.target.value) : e.target.value || null,
                              } as Partial<GridMca>)
                            }
                            className={`input h-8 min-w-0 ${c.width} ${c.type === 'number' ? 'text-right' : ''} ${c.key === 'bcc_rate' ? 'border-sky-400 bg-sky-50 dark:bg-sky-500/10' : ''}`}
                          />
                        </td>
                      );
                      return c.key === 'liquidation_amount'
                        ? [
                            cell,
                            <td key="liq-usd">
                              <div
                                className="flex h-8 w-32 items-center justify-end rounded-md border border-amber-300 bg-amber-50 px-2 font-mono font-semibold tabular-nums text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                                title="Liquidation CDF ÷ DGDA rate"
                                aria-readonly="true"
                              >
                                {money(m.bcc_rate > 0 ? m.liquidation_amount / m.bcc_rate : 0)}
                              </div>
                            </td>,
                          ]
                        : [cell];
                    })}
                    {!readonly && (
                      <td>
                        <button type="button" onClick={() => void removeFile(idx)} title="Remove this file" aria-label={`Remove ${mcaLabel(m.mca_id)}`} className="ico-delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2 p-3">
            {mca.map((m, idx) => (
              <li
                key={m.id ?? `f-${m.mca_id}-${idx}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs"
              >
                <span className="font-mono font-semibold">{mcaLabel(m.mca_id)}</span>
                {!readonly && (
                  <button type="button" onClick={() => void removeFile(idx)} aria-label={`Remove ${mcaLabel(m.mca_id)}`} className="ico-delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* ---- Quotation + items ------------------------------------------ */}
      <section className="rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg bg-muted px-3 py-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">Quotation Items</h4>
          {!readonly && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect
                className="w-72"
                size="sm"
                value={quotationId}
                onChange={(v) => emit({ quotation_id: v ? Number(v) : null })}
                options={quotationOptions}
                placeholder={quotationOptions.length ? 'Select quotation…' : 'No quotations for this client'}
                aria-label="Quotation"
              />
              <button
                type="button"
                onClick={() => quotationId && void loadQuotationItems(Number(quotationId), mca)}
                disabled={!quotationId}
                className="btn-neutral btn-sm disabled:opacity-50"
                title="Replace the lines below with this quotation's"
              >
                <RefreshCw className="h-4 w-4" /> Load items
              </button>
              <button type="button" onClick={addBlankItem} className="btn-neutral btn-sm">
                <Plus className="h-4 w-4" /> Row
              </button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No lines yet — select files to auto-match the quotation, or pick one and load its items.
          </p>
        ) : (
          <div className="space-y-4 p-3">
            {groups.map((g) => {
              const shownRows = g.cdf && !customsShown ? [] : g.rows;
              const sub = round2(g.rows.reduce((s, r) => s + (g.cdf ? r.it.rate_cdf : r.it.subtotal_usd), 0));
              const vat = round2(g.rows.reduce((s, r) => s + (g.cdf ? r.it.vat_cdf : r.it.tva_usd), 0));
              const tot = round2(g.rows.reduce((s, r) => s + (g.cdf ? r.it.total_cdf : r.it.total_usd), 0));
              return (
                <div key={g.header} className="overflow-hidden rounded-md border border-border">
                  <div className="flex items-center justify-between gap-2 bg-primary-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                    <span>{g.header}</span>
                    {g.cdf && !readonly && (
                      <span className="flex items-center gap-1.5">
                      {customsShown && (
                        <button
                          type="button"
                          onClick={toggleZeros}
                          aria-pressed={!!zeroStash}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${zeroStash ? 'border-white/60 bg-white/40' : 'border-white/40 bg-white/20 hover:bg-white/30'}`}
                          title={zeroStash ? 'Put the zero-value lines back on the invoice' : 'Leave lines whose Total/CDF is 0 off the invoice'}
                        >
                          {zeroStash ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {zeroStash ? `Show All (${zeroStash.length} hidden)` : 'Hide Zeros'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => emit({ first_categoty_edited: customsShown ? 'H' : 'S' })}
                        className="inline-flex items-center gap-1 rounded border border-white/40 bg-white/20 px-2 py-0.5 text-[10px] font-semibold hover:bg-white/30"
                        title={customsShown ? 'Leave the liquidation off this invoice' : 'Put the liquidation on this invoice'}
                      >
                        {customsShown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {customsShown ? 'Hide' : 'Show'}
                      </button>
                      </span>
                    )}
                  </div>
                  {g.cdf && !customsShown ? (
                    <p className="px-3 py-3 text-xs italic text-muted-foreground">
                      Hidden — the liquidation is not billed on this invoice ({g.rows.length} line(s) kept).
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table-base whitespace-nowrap text-xs">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th className="text-center">Unit</th>
                            {g.cdf ? (
                              <>
                                <th className="text-right">CIF/Split</th>
                                <th className="text-right">%</th>
                                <th className="text-right">Rate/CDF</th>
                                <th className="text-right">VAT/CDF</th>
                                <th className="text-right">Total/CDF</th>
                              </>
                            ) : kind === 'export' ? (
                              <>
                                <th className="text-right">Qty</th>
                                <th className="text-right">Cost/USD</th>
                                <th className="text-center">TVA</th>
                                <th className="text-right">Subtotal USD</th>
                                <th className="text-right">TVA 16%</th>
                                <th className="text-right">Total USD</th>
                              </>
                            ) : (
                              <>
                                <th className="text-right">Qty</th>
                                <th className="text-right">Taux/USD</th>
                                <th className="text-center">Currency</th>
                                <th className="text-center">TVA</th>
                                <th className="text-right">TVA/USD</th>
                                <th className="text-right">Total en USD</th>
                              </>
                            )}
                            {!readonly && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {shownRows.map(({ it, idx }) => (
                            <tr key={it.id ?? `l-${idx}`}>
                              <td>
                                <input
                                  value={it.item_name ?? ''}
                                  disabled={readonly}
                                  aria-label="Description"
                                  onChange={(e) => patchItem(idx, { item_name: e.target.value })}
                                  className="input h-8 w-72 min-w-0"
                                  title={it.item_name ?? ''}
                                />
                              </td>
                              <td className="text-center text-muted-foreground">{it.unit_text || '—'}</td>
                              {g.cdf ? (
                                <>
                                  <td className="text-right font-mono tabular-nums text-muted-foreground">{money(it.cif_split)}</td>
                                  <NumCell v={it.percentage} step="0.001" ro={readonly} label="Percentage" onChange={(v) => patchItem(idx, { percentage: v })} />
                                  <NumCell v={it.rate_cdf} ro={readonly} label="Rate in CDF" onChange={(v) => patchItem(idx, { rate_cdf: v })} />
                                  <NumCell v={it.vat_cdf} ro={readonly} label="VAT in CDF" onChange={(v) => patchItem(idx, { vat_cdf: v })} />
                                  <NumCell v={it.total_cdf} ro={readonly} label="Total in CDF" onChange={(v) => patchItem(idx, { total_cdf: v })} />
                                </>
                              ) : (
                                <>
                                  <NumCell v={it.quantity} step="0.001" ro={readonly} label="Quantity" onChange={(v) => patchItem(idx, { quantity: v })} />
                                  <NumCell v={it.taux_usd} step="0.0001" ro={readonly} label="Rate in USD" onChange={(v) => patchItem(idx, { taux_usd: v, cost_usd: v })} />
                                  {kind === 'import' && (
                                    <td className="text-center text-[10px] font-medium uppercase text-muted-foreground">{currencyOf(it)}</td>
                                  )}
                                  <td className="text-center">
                                    <Toggle size="sm" checked={!!it.has_tva} disabled={readonly} aria-label={`TVA on ${it.item_name ?? 'line'}`} onChange={(v) => patchItem(idx, { has_tva: v ? 1 : 0 })} />
                                  </td>
                                  {kind === 'export' && (
                                    <td className="text-right font-mono tabular-nums">{money(it.subtotal_usd)}</td>
                                  )}
                                  <td className="text-right font-mono tabular-nums">{money(it.tva_usd)}</td>
                                  <td className="text-right font-mono font-semibold tabular-nums">{money(it.total_usd)}</td>
                                </>
                              )}
                              {!readonly && (
                                <td>
                                  <button type="button" onClick={() => removeItem(idx)} title="Remove this line" aria-label={`Remove ${it.item_name ?? 'line'}`} className="ico-delete">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          <tr className="bg-muted/50 font-semibold">
                            {/* Label spans every column before the money ones:
                                CDF — Description, Unit, CIF, %; USD — Description,
                                Unit, Qty, Rate, (import: Currency,) TVA toggle. */}
                            <td colSpan={g.cdf ? 4 : kind === 'import' ? 6 : 5} className="text-right">
                              Sub-total ({g.cdf ? 'CDF' : 'USD'})
                            </td>
                            {g.cdf ? (
                              <>
                                <td className="text-right font-mono tabular-nums">{money(sub)}</td>
                                <td className="text-right font-mono tabular-nums">{money(vat)}</td>
                                <td className="text-right font-mono tabular-nums">{money(tot)}</td>
                              </>
                            ) : (
                              <>
                                {kind === 'export' && <td className="text-right font-mono tabular-nums">{money(sub)}</td>}
                                <td className="text-right font-mono tabular-nums">{money(vat)}</td>
                                <td className="text-right font-mono tabular-nums">{money(tot)}</td>
                              </>
                            )}
                            {!readonly && <td />}
                          </tr>
                        </tbody>
                      </table>
                      {g.cdf && (
                        <div className="flex flex-wrap justify-end gap-6 border-t border-border bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
                          <span>Liquidation in CDF: {money(tot)} FC</span>
                          <span>
                            Liquidation in USD: ${money(dgdaRate > 0 ? tot / dgdaRate : 0)}
                            {dgdaRate <= 0 && ' (enter the DGDA rate)'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Summary ------------------------------------------------- */}
        {items.length > 0 &&
          (kind === 'export' ? (
            <div className="flex flex-wrap items-center justify-end gap-6 rounded-b-lg bg-foreground px-4 py-2.5 text-xs font-bold uppercase text-background">
              <span>Total clearing cost in USD / Coût total en USD:</span>
              <span className="font-mono tabular-nums">Subtotal {money(totals.subtotal)}</span>
              <span className="font-mono tabular-nums">TVA {money(totals.tva)}</span>
              <span className="font-mono text-sm tabular-nums">{money(totals.total)}</span>
            </div>
          ) : (
            <dl className="ms-auto w-full max-w-sm space-y-1.5 border-t border-border p-4 text-sm">
              <SummaryRow label="Total excl. TVA" value={`$${money(totals.subtotal)}`} />
              <SummaryRow label="TVA (16%)" value={`$${money(totals.tva)}`} />
              <SummaryRow label="Grand Total" value={`$${money(totals.total)}`} emphasis />
              <SummaryRow
                label="Equivalent CDF"
                value={dgdaRate > 0 ? `${money(totals.total * dgdaRate)} FC` : '— (enter the DGDA rate)'}
              />
            </dl>
          ))}
      </section>
    </div>
  );
}

/**
 * main's export quantity rule (updateAllItemUnits): a line with a unit is
 * charged per FILE, a line without one per TONNE of the files' total weight.
 */
function applyExportUnits(lines: GridItem[], files: GridMca[]): GridItem[] {
  const count = files.length;
  if (count === 0) return lines;
  const weight = round2(files.reduce((s, m) => s + (m.weight || 0), 0));
  return lines.map((it) => recompute({ ...it, quantity: it.unit_id ? count : weight }));
}

function NumCell({
  v,
  step = '0.01',
  ro,
  label,
  onChange,
}: {
  v: number;
  step?: string;
  ro: boolean;
  label: string;
  onChange: (v: number) => void;
}) {
  return (
    <td>
      <input
        type="number"
        step={step}
        disabled={ro}
        aria-label={label}
        value={Number.isFinite(v) && v !== 0 ? v : ''}
        placeholder="0.00"
        onChange={(e) => onChange(num(e.target.value))}
        className="input h-8 w-28 min-w-0 text-right font-mono"
      />
    </td>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`font-mono tabular-nums ${emphasis ? 'text-base font-bold text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}>
        {value}
      </dd>
    </div>
  );
}
