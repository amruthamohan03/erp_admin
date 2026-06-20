'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';

// Quotation builder — shared by /quotations/new and /quotations/[id].
// Header form on top, sectioned line tables (one card per quotation
// category), live total preview via /api/v1/quotations/preview so all
// math stays server-side. Save → POST or PUT depending on initialId.
//
// Line column shape varies per quotation path:
//   * Import-Definitive + customs category → CDF columns
//   * Export kind → cost-only
//   * Default (everything else) → qty × taux
// Path is detected client-side from the kind name (mirrors detectKind
// in compute.ts) so the UI doesn't render a column the server will
// silently zero out.

interface ClientOption {
  id: number;
  name: string;
}

interface KindOption {
  id: number;
  kind_name: string;
}

interface TransportModeOption {
  id: number;
  transport_mode_name: string;
}

interface GoodsTypeOption {
  id: number;
  goods_type: string;
}

interface CategoryOption {
  id: number;
  category_name: string;
  category_header: string | null;
  display_order: number;
  is_customs: boolean;
}

interface ItemOption {
  id: number;
  item_name: string;
  item_code: string | null;
  category_id: number | null;
  percentage: string;
  item_type: string;
}

interface UnitOption {
  id: number;
  unit_name: string;
  unit_code: string | null;
}

interface CurrencyOption {
  id: number;
  currency_short_name: string;
}

export interface InitialQuotation {
  id: number;
  header: {
    client_id: number;
    quotation_ref: string;
    quotation_date: string | null;
    kind_id: number | null;
    transport_mode_id: number | null;
    goods_type_id: number | null;
    arsp: string | null;
  };
  items: Array<{
    category_id: number | null;
    item_id: number | null;
    unit_id: number | null;
    currency_id: number | null;
    has_tva: boolean;
    quantity: string;
    taux_usd: string | null;
    cost_usd: string | null;
    cif_split: string | null;
    percentage: string | null;
    rate_cdf: string | null;
  }>;
}

interface LineRow {
  _localId: string;
  category_id: number;
  item_id: number | null;
  unit_id: number | null;
  currency_id: number | null;
  has_tva: boolean;
  quantity: string;
  taux_usd: string;
  cost_usd: string;
  cif_split: string;
  percentage: string;
  rate_cdf: string;
}

interface HeaderForm {
  client_id: string;
  quotation_ref: string;
  quotation_date: string;
  kind_id: string;
  transport_mode_id: string;
  goods_type_id: string;
  arsp: 'Enabled' | 'Disabled';
}

interface PreviewItem {
  totalUsd?: string;
  totalCdf?: string;
}

interface PreviewResponse {
  header: {
    subTotal?: string;
    vatAmount?: string;
    arspAmount?: string;
    totalAmount?: string;
    subTotalCdf?: string;
    vatAmountCdf?: string;
    totalAmountCdf?: string;
  };
  items: PreviewItem[];
}

type LinePath = 'default' | 'export' | 'cdf';

function detectKindPath(kindName: string | undefined): {
  isExport: boolean;
  isImportDefinitive: boolean;
} {
  const k = (kindName || '').toUpperCase();
  return {
    isExport: k.includes('EXPORT'),
    isImportDefinitive: k.includes('DEFINIT'),
  };
}

function pathFor(kindName: string | undefined, isCustoms: boolean): LinePath {
  const { isExport, isImportDefinitive } = detectKindPath(kindName);
  if (isImportDefinitive && isCustoms) return 'cdf';
  if (isExport) return 'export';
  return 'default';
}

let localIdSeq = 1;
function nextLocalId(): string {
  localIdSeq += 1;
  return `l-${localIdSeq}`;
}

function newEmptyLine(categoryId: number): LineRow {
  return {
    _localId: nextLocalId(),
    category_id: categoryId,
    item_id: null,
    unit_id: null,
    currency_id: null,
    has_tva: false,
    quantity: '1',
    taux_usd: '0',
    cost_usd: '0',
    cif_split: '0',
    percentage: '0',
    rate_cdf: '0',
  };
}

function fmtMoney(v: string | undefined): string {
  if (v == null) return '0.00';
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface QuotationBuilderProps {
  /** Present when editing; undefined when creating. */
  initial?: InitialQuotation;
}

export default function QuotationBuilder({ initial }: QuotationBuilderProps) {
  const router = useRouter();

  // Master data
  const [clients, setClients] = React.useState<ClientOption[]>([]);
  const [kinds, setKinds] = React.useState<KindOption[]>([]);
  const [transports, setTransports] = React.useState<TransportModeOption[]>([]);
  const [goodsTypes, setGoodsTypes] = React.useState<GoodsTypeOption[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [allItems, setAllItems] = React.useState<ItemOption[]>([]);
  const [units, setUnits] = React.useState<UnitOption[]>([]);
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([]);
  const [loadingDeps, setLoadingDeps] = React.useState(true);
  const [depsError, setDepsError] = React.useState<string | null>(null);

  // Form state
  const [header, setHeader] = React.useState<HeaderForm>(() => ({
    client_id: initial ? String(initial.header.client_id) : '',
    quotation_ref: initial?.header.quotation_ref ?? '',
    quotation_date: initial?.header.quotation_date ?? '',
    kind_id: initial?.header.kind_id ? String(initial.header.kind_id) : '',
    transport_mode_id: initial?.header.transport_mode_id
      ? String(initial.header.transport_mode_id)
      : '',
    goods_type_id: initial?.header.goods_type_id
      ? String(initial.header.goods_type_id)
      : '',
    arsp: initial?.header.arsp === 'Enabled' ? 'Enabled' : 'Disabled',
  }));

  const [lines, setLines] = React.useState<LineRow[]>(() => {
    if (!initial) return [];
    return initial.items
      .filter((it) => it.category_id != null)
      .map((it) => ({
        _localId: nextLocalId(),
        category_id: it.category_id as number,
        item_id: it.item_id,
        unit_id: it.unit_id,
        currency_id: it.currency_id,
        has_tva: it.has_tva,
        quantity: it.quantity ?? '1',
        taux_usd: it.taux_usd ?? '0',
        cost_usd: it.cost_usd ?? '0',
        cif_split: it.cif_split ?? '0',
        percentage: it.percentage ?? '0',
        rate_cdf: it.rate_cdf ?? '0',
      }));
  });

  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Load every dependent master in parallel on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, k, t, g, cat, i, u, cur] = await Promise.all([
          fetch('/api/v1/clients?pageSize=200').then((r) => r.json()),
          fetch('/api/v1/kinds?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/transport-modes?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/goods-types?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/quotation-categories?pageSize=100').then((r) =>
            r.json(),
          ),
          fetch('/api/v1/items?pageSize=500').then((r) => r.json()),
          fetch('/api/v1/units?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/currencies?pageSize=100').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (c.ok) setClients(c.data);
        if (k.ok) setKinds(k.data);
        if (t.ok) setTransports(t.data);
        if (g.ok) setGoodsTypes(g.data);
        if (cat.ok) setCategories(cat.data);
        if (i.ok) setAllItems(i.data);
        if (u.ok) setUnits(u.data);
        if (cur.ok) setCurrencies(cur.data);
      } catch {
        if (!cancelled) setDepsError('Network error loading masters');
      } finally {
        if (!cancelled) setLoadingDeps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The selected kind drives every line's path. We pass kind_name to
  // detectKindPath, which mirrors compute.ts's substring detection.
  const selectedKindName = React.useMemo(() => {
    const id = header.kind_id ? Number(header.kind_id) : null;
    if (!id) return '';
    return kinds.find((k) => k.id === id)?.kind_name ?? '';
  }, [header.kind_id, kinds]);

  // Compose the request body for both /preview and final save.
  const buildBody = React.useCallback(() => {
    if (!header.client_id || !header.quotation_ref.trim()) return null;
    return {
      client_id: Number(header.client_id),
      quotation_ref: header.quotation_ref.trim(),
      quotation_date: header.quotation_date || null,
      kind_id: header.kind_id ? Number(header.kind_id) : null,
      transport_mode_id: header.transport_mode_id
        ? Number(header.transport_mode_id)
        : null,
      goods_type_id: header.goods_type_id ? Number(header.goods_type_id) : null,
      arsp: header.arsp,
      items: lines.map((l) => ({
        category_id: l.category_id,
        item_id: l.item_id,
        unit_id: l.unit_id,
        currency_id: l.currency_id,
        has_tva: l.has_tva,
        quantity: l.quantity ? Number(l.quantity) : 0,
        taux_usd: l.taux_usd ? Number(l.taux_usd) : 0,
        cost_usd: l.cost_usd ? Number(l.cost_usd) : 0,
        cif_split: l.cif_split ? Number(l.cif_split) : 0,
        percentage: l.percentage ? Number(l.percentage) : 0,
        rate_cdf: l.rate_cdf ? Number(l.rate_cdf) : 0,
      })),
    };
  }, [header, lines]);

  // Debounced live preview. Re-runs whenever the form changes; aborts
  // in-flight previews via a sequence counter so we don't render stale
  // numbers.
  const previewSeq = React.useRef(0);
  React.useEffect(() => {
    const body = buildBody();
    if (!body) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    const mySeq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch('/api/v1/quotations/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (mySeq !== previewSeq.current) return;
        const json = await res.json();
        if (mySeq !== previewSeq.current) return;
        if (json.ok) {
          setPreview(json.data);
          setPreviewError(null);
        } else {
          setPreviewError(json.error?.message ?? 'Preview failed');
        }
      } catch {
        if (mySeq === previewSeq.current) {
          setPreviewError('Preview network error');
        }
      } finally {
        if (mySeq === previewSeq.current) setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [buildBody]);

  // Mirror preview's per-line totals back into a Map keyed by index so
  // the line tables can show server-computed line totals next to inputs.
  // The server's items array preserves input order *minus* empty rows
  // (no item_id), so we have to skip those when correlating.
  const lineTotals = React.useMemo(() => {
    const map = new Map<string, { usd: string; cdf: string }>();
    if (!preview) return map;
    let p = 0;
    for (const line of lines) {
      if (!line.item_id) continue;
      const previewItem = preview.items[p];
      p += 1;
      if (!previewItem) continue;
      map.set(line._localId, {
        usd: previewItem.totalUsd ?? '0',
        cdf: previewItem.totalCdf ?? '0',
      });
    }
    return map;
  }, [preview, lines]);

  function updateHeader(patch: Partial<HeaderForm>) {
    setHeader((prev) => ({ ...prev, ...patch }));
  }

  function addLine(categoryId: number) {
    setLines((prev) => [...prev, newEmptyLine(categoryId)]);
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l._localId !== localId));
  }

  function updateLine(localId: string, patch: Partial<LineRow>) {
    setLines((prev) =>
      prev.map((l) => (l._localId === localId ? { ...l, ...patch } : l)),
    );
  }

  async function handleSave() {
    const body = buildBody();
    if (!body) {
      setSaveError('Client and Reference are required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const url = initial
        ? `/api/v1/quotations/${initial.id}`
        : '/api/v1/quotations';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveError(json.error?.message ?? 'Save failed');
        return;
      }
      router.push('/quotations');
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  }

  // Categories visible on the form — only the ones in display_order.
  // Empty categories still render so the user can add lines to them.
  const orderedCategories = React.useMemo(
    () => [...categories].sort((a, b) => a.display_order - b.display_order),
    [categories],
  );

  if (loadingDeps) {
    return (
      <div className="text-sm text-slate-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading masters…
      </div>
    );
  }

  if (depsError) {
    return (
      <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
        {depsError}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/quotations"
            className="text-sm text-slate-500 hover:underline flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to quotations
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary-600" />
            {initial ? `Quotation #${initial.id}` : 'New Quotation'}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || previewing}
          className="btn-primary"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Quotation'}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {saveError}
        </div>
      )}
      {previewError && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700 border border-amber-200">
          {previewError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: header form + line sections */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header card */}
          <div className="card p-6 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              Header
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Client *</label>
                <SearchableSelect
                  value={header.client_id}
                  onChange={(v) => updateHeader({ client_id: v })}
                  options={clients.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  }))}
                  placeholder="Pick a client..."
                  emptyLabel="— Select a client —"
                  required
                />
              </div>
              <div>
                <label className="label">Reference *</label>
                <input
                  className="input"
                  value={header.quotation_ref}
                  onChange={(e) =>
                    updateHeader({ quotation_ref: e.target.value })
                  }
                  required
                  placeholder="Q-2026-001"
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={header.quotation_date}
                  onChange={(e) =>
                    updateHeader({ quotation_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Kind</label>
                <SearchableSelect
                  value={header.kind_id}
                  onChange={(v) => updateHeader({ kind_id: v })}
                  options={kinds.map((k) => ({
                    value: String(k.id),
                    label: k.kind_name,
                  }))}
                  placeholder="Pick a kind..."
                  emptyLabel="— No kind —"
                />
              </div>
              <div>
                <label className="label">Transport Mode</label>
                <SearchableSelect
                  value={header.transport_mode_id}
                  onChange={(v) => updateHeader({ transport_mode_id: v })}
                  options={transports.map((t) => ({
                    value: String(t.id),
                    label: t.transport_mode_name,
                  }))}
                  placeholder="Pick a mode..."
                  emptyLabel="— No mode —"
                />
              </div>
              <div>
                <label className="label">Goods Type</label>
                <SearchableSelect
                  value={header.goods_type_id}
                  onChange={(v) => updateHeader({ goods_type_id: v })}
                  options={goodsTypes.map((g) => ({
                    value: String(g.id),
                    label: g.goods_type,
                  }))}
                  placeholder="Pick a type..."
                  emptyLabel="— No type —"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <Toggle
                checked={header.arsp === 'Enabled'}
                onChange={(v) =>
                  updateHeader({ arsp: v ? 'Enabled' : 'Disabled' })
                }
                label="ARSP (1.2% fee on the VAT-eligible subtotal)"
              />
            </div>
          </div>

          {/* Category sections */}
          {orderedCategories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              kindName={selectedKindName}
              lines={lines.filter((l) => l.category_id === cat.id)}
              items={allItems.filter((it) => it.category_id === cat.id)}
              units={units}
              currencies={currencies}
              lineTotals={lineTotals}
              onAddLine={() => addLine(cat.id)}
              onRemoveLine={removeLine}
              onUpdateLine={updateLine}
            />
          ))}
        </div>

        {/* Right: live totals */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Totals
              </div>
              {previewing && (
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                USD
              </div>
              <Row label="Subtotal" value={fmtMoney(preview?.header.subTotal)} />
              <Row label="VAT" value={fmtMoney(preview?.header.vatAmount)} />
              <Row label="ARSP" value={fmtMoney(preview?.header.arspAmount)} />
              <Row
                label="Total USD"
                value={fmtMoney(preview?.header.totalAmount)}
                emphasized
              />
              {preview?.header.totalAmountCdf &&
                Number(preview.header.totalAmountCdf) > 0 && (
                  <>
                    <div className="text-xs uppercase tracking-wide text-slate-400 pt-3 border-t border-slate-100">
                      CDF (customs)
                    </div>
                    <Row
                      label="Subtotal"
                      value={fmtMoney(preview.header.subTotalCdf)}
                    />
                    <Row
                      label="VAT"
                      value={fmtMoney(preview.header.vatAmountCdf)}
                    />
                    <Row
                      label="Total CDF"
                      value={fmtMoney(preview.header.totalAmountCdf)}
                      emphasized
                    />
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={emphasized ? 'font-medium' : 'text-slate-600'}>
        {label}
      </span>
      <span
        className={
          'font-mono ' +
          (emphasized ? 'text-lg font-bold text-slate-900' : 'text-slate-900')
        }
      >
        {value}
      </span>
    </div>
  );
}

function CategorySection({
  category,
  kindName,
  lines,
  items,
  units,
  currencies,
  lineTotals,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
}: {
  category: CategoryOption;
  kindName: string;
  lines: LineRow[];
  items: ItemOption[];
  units: UnitOption[];
  currencies: CurrencyOption[];
  lineTotals: Map<string, { usd: string; cdf: string }>;
  onAddLine: () => void;
  onRemoveLine: (localId: string) => void;
  onUpdateLine: (localId: string, patch: Partial<LineRow>) => void;
}) {
  const path = pathFor(kindName, category.is_customs);

  return (
    <div className="card">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-900">
            {category.category_header || category.category_name}
          </div>
          <div className="text-xs text-slate-500">
            {category.is_customs && (
              <span className="text-amber-700 mr-2">Customs</span>
            )}
            Path:{' '}
            <code>{path === 'cdf' ? 'CDF' : path === 'export' ? 'Export USD' : 'Default USD'}</code>
          </div>
        </div>
        <button
          onClick={onAddLine}
          className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Add line
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          No lines in this category.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                {path === 'cdf' ? (
                  <>
                    <th className="text-right">CIF split</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Rate CDF</th>
                    <th className="text-right">Total CDF</th>
                  </>
                ) : path === 'export' ? (
                  <>
                    <th className="text-right">Cost USD</th>
                    <th className="text-center">VAT?</th>
                    <th className="text-right">Total USD</th>
                  </>
                ) : (
                  <>
                    <th>Unit</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Taux USD</th>
                    <th className="text-center">VAT?</th>
                    <th className="text-right">Total USD</th>
                  </>
                )}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <LineRowEditor
                  key={line._localId}
                  line={line}
                  path={path}
                  items={items}
                  units={units}
                  currencies={currencies}
                  totals={lineTotals.get(line._localId)}
                  onUpdate={(patch) => onUpdateLine(line._localId, patch)}
                  onRemove={() => onRemoveLine(line._localId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LineRowEditor({
  line,
  path,
  items,
  units,
  currencies,
  totals,
  onUpdate,
  onRemove,
}: {
  line: LineRow;
  path: LinePath;
  items: ItemOption[];
  units: UnitOption[];
  currencies: CurrencyOption[];
  totals: { usd: string; cdf: string } | undefined;
  onUpdate: (patch: Partial<LineRow>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="align-top">
      <td className="min-w-[200px]">
        <SearchableSelect
          value={line.item_id != null ? String(line.item_id) : ''}
          onChange={(v) => onUpdate({ item_id: v ? Number(v) : null })}
          options={items.map((it) => ({
            value: String(it.id),
            label: it.item_code ? `${it.item_name} (${it.item_code})` : it.item_name,
          }))}
          placeholder="Pick an item..."
          emptyLabel="— None —"
        />
      </td>

      {path === 'cdf' ? (
        <>
          <td className="min-w-[100px]">
            <input
              type="number"
              step="0.01"
              className="input text-right"
              value={line.cif_split}
              onChange={(e) => onUpdate({ cif_split: e.target.value })}
            />
          </td>
          <td className="min-w-[80px]">
            <input
              type="number"
              step="0.0001"
              className="input text-right"
              value={line.percentage}
              onChange={(e) => onUpdate({ percentage: e.target.value })}
            />
          </td>
          <td className="min-w-[110px]">
            <input
              type="number"
              step="0.01"
              className="input text-right"
              value={line.rate_cdf}
              onChange={(e) => onUpdate({ rate_cdf: e.target.value })}
            />
          </td>
          <td className="text-right font-mono whitespace-nowrap">
            {fmtMoney(totals?.cdf)}
          </td>
        </>
      ) : path === 'export' ? (
        <>
          <td className="min-w-[110px]">
            <input
              type="number"
              step="0.01"
              className="input text-right"
              value={line.cost_usd}
              onChange={(e) => onUpdate({ cost_usd: e.target.value })}
            />
          </td>
          <td className="text-center">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={line.has_tva}
              onChange={(e) => onUpdate({ has_tva: e.target.checked })}
            />
          </td>
          <td className="text-right font-mono whitespace-nowrap">
            {fmtMoney(totals?.usd)}
          </td>
        </>
      ) : (
        <>
          <td className="min-w-[100px]">
            <select
              className="input"
              value={line.unit_id != null ? String(line.unit_id) : ''}
              onChange={(e) =>
                onUpdate({
                  unit_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code || u.unit_name}
                </option>
              ))}
            </select>
          </td>
          <td className="min-w-[80px]">
            <input
              type="number"
              step="0.01"
              className="input text-right"
              value={line.quantity}
              onChange={(e) => onUpdate({ quantity: e.target.value })}
            />
          </td>
          <td className="min-w-[110px]">
            <input
              type="number"
              step="0.01"
              className="input text-right"
              value={line.taux_usd}
              onChange={(e) => onUpdate({ taux_usd: e.target.value })}
            />
          </td>
          <td className="text-center">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={line.has_tva}
              onChange={(e) => onUpdate({ has_tva: e.target.checked })}
            />
          </td>
          <td className="text-right font-mono whitespace-nowrap">
            {fmtMoney(totals?.usd)}
          </td>
        </>
      )}

      <td className="text-right">
        <button
          onClick={onRemove}
          className="text-slate-400 hover:text-red-600 p-1"
          title="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {/* Currency picker is hidden in the row to keep it compact, but
            persisted; defaulting to whatever the first available currency
            is keeps existing data valid. Surfaces in a future bulk-edit
            slice. */}
        {currencies[0] && line.currency_id == null && (
          <span className="hidden">
            {(() => {
              // Defensive: ensure currency_id is set so the row passes
              // schema. setTimeout to defer the setState out of render.
              setTimeout(() => onUpdate({ currency_id: currencies[0].id }), 0);
              return null;
            })()}
          </span>
        )}
      </td>
    </tr>
  );
}
