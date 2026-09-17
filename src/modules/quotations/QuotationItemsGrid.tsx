'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Plus, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { fetchMasterOptions, type SelectOption } from '@/lib/selectOptions';
import { computeLine, headerTotals, lineMode, type LineMode } from '@/lib/quotations/compute';
import { emptyQuotationLine, type QuotationLine } from '@/lib/quotations/line';

// §2 step 2 — a quotation's priced lines, grouped by category, rendered inside
// the transaction page by FieldRenderer (`field_type: 'quotation-items'`).
//
// The grid's whole job is that the operator sees the arithmetic before they
// commit to it, so every computed cell and the summary below come from
// `computeLine` / `headerTotals` in [compute.ts](src/lib/quotations/compute.ts)
// — the SAME functions the server recomputes with on save. Nothing here does
// its own maths (§4.10); a grid that totalled independently is how a screen
// comes to show one figure while the database stores another.
//
// Three column sets, chosen per category by `lineMode`:
//
//   standard — QTY × TAUX/USD          (imports, and Import-Definitive's
//                                       non-customs categories)
//   export   — a single COST/USD       (any kind whose name says EXPORT)
//   cdf      — CIF/Split, %, Rate/CDF  (Import-Definitive, customs category
//                                       only) — the duties are billed in
//                                       Congolese francs, not dollars
//
// Which categories are "customs" is the master's `is_customs` flag, not a
// substring match on the name — main tested `stripos(name, 'CUSTOMS')`, so
// renaming the category would silently move every line onto the wrong columns.

interface Category {
  id: number;
  category_name: string;
  category_header: string | null;
  is_customs: boolean;
  display_order: number;
}

interface ItemOption {
  id: number;
  name: string;
  category_id: number | null;
  /** Which kinds the item may be quoted on — 'I' import, 'E' export. */
  item_type: string;
}

interface QuotationItemsGridProps {
  value: QuotationLine[];
  onChange: (lines: QuotationLine[]) => void;
  readonly: boolean;
  invalid?: boolean;
  /** The header's kind, which decides the column set. */
  kindId: number | null;
  /** 'Enabled' switches the 1.2% ARSP fee on in the summary. */
  arsp: string | null;
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** A computed cell — read-only, tinted, and never typed into. */
function Computed({ value, tone }: { value: string; tone?: 'total' | 'cdf' }) {
  const tint =
    tone === 'total'
      ? 'bg-amber-50 font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200'
      : tone === 'cdf'
        ? 'bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'
        : 'bg-muted text-muted-foreground';
  return (
    <div
      className={`flex h-9 items-center justify-end rounded-md border border-border px-2 font-mono text-xs tabular-nums ${tint}`}
      aria-readonly="true"
    >
      {value}
    </div>
  );
}

/** Column headers per mode — kept beside the row renderer so they cannot drift. */
const HEADERS: Record<LineMode, string[]> = {
  standard: ['Description', 'Unit', 'Qty', 'Taux/USD', 'Currency', 'TVA', 'TVA/USD', 'Total USD'],
  export: ['Description', 'Unit', 'Cost/USD', 'Subtotal USD', 'Currency', 'TVA', 'TVA-16', 'Total USD'],
  cdf: ['Description', 'Unit', 'CIF/Split', '%', 'Rate/CDF', 'VAT/CDF', 'Total/CDF'],
};

/** Grid template per mode; the last track is the row's two buttons. */
const COLUMNS: Record<LineMode, string> = {
  standard: 'minmax(0,2.2fr) 90px 80px 110px 90px 70px 110px 120px 72px',
  export: 'minmax(0,2.2fr) 90px 110px 110px 90px 70px 110px 120px 72px',
  cdf: 'minmax(0,2.2fr) 90px 120px 90px 120px 120px 120px 72px',
};

export default function QuotationItemsGrid({
  value,
  onChange,
  readonly,
  invalid,
  kindId,
  arsp,
}: QuotationItemsGridProps) {
  const lines = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [units, setUnits] = useState<SelectOption[]>([]);
  const [currencies, setCurrencies] = useState<SelectOption[]>([]);
  const [kindName, setKindName] = useState('');
  const [loading, setLoading] = useState(true);

  // The kind's NAME decides the column set, and the form only holds its id.
  // Fetched as a list once rather than per change: seven kinds is one request,
  // and a lookup per keystroke on the header would be a request per keystroke.
  const [kinds, setKinds] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let live = true;
    void (async () => {
      const [catRes, itemRes, unitRows, curRows, kindRows] = await Promise.all([
        fetch('/api/v1/quotation-categories?pageSize=100').then((r) => r.json()).catch(() => null),
        fetch('/api/v1/items?pageSize=100').then((r) => r.json()).catch(() => null),
        // The short code when a unit has one, else its name — main's
        // `unit_code || unit_name`. Every unit in this database has a null
        // code, so asking for the code alone rendered the picker as ids.
        fetchMasterOptions('units', ['unit_code', 'unit_name']),
        fetchMasterOptions('currencies', 'currency_short_name'),
        fetchMasterOptions('kinds', 'kind_name'),
      ]);
      if (!live) return;

      const rows = (j: unknown): Record<string, unknown>[] => {
        const body = j as { ok?: boolean; data?: unknown };
        if (!body?.ok) return [];
        if (Array.isArray(body.data)) return body.data as Record<string, unknown>[];
        const inner = (body.data as { items?: unknown })?.items;
        return Array.isArray(inner) ? (inner as Record<string, unknown>[]) : [];
      };

      setCategories(
        rows(catRes)
          .map((c) => ({
            id: Number(c.id),
            category_name: String(c.category_name ?? ''),
            category_header: (c.category_header as string | null) ?? null,
            is_customs: c.is_customs === true,
            display_order: Number(c.display_order ?? 0),
          }))
          .sort((a, b) => a.display_order - b.display_order),
      );
      setItems(
        rows(itemRes).map((i) => ({
          id: Number(i.id),
          name: String(i.item_name ?? i.name ?? i.id),
          category_id: i.category_id == null ? null : Number(i.category_id),
          item_type: String(i.item_type ?? ''),
        })),
      );
      setUnits(unitRows.map((u) => ({ value: String(u.id), label: u.label })));
      setCurrencies(curRows.map((c) => ({ value: String(c.id), label: c.label })));
      setKinds(new Map(kindRows.map((k) => [k.id, k.label])));
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKindName(kindId === null ? '' : (kinds.get(kindId) ?? ''));
  }, [kindId, kinds]);

  /**
   * Seed one blank line per category the first time a kind is chosen.
   *
   * Only when the grid is genuinely empty and only once, so it cannot fight an
   * operator who has deliberately deleted every row.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || readonly || loading) return;
    if (lines.length > 0 || categories.length === 0 || !kindName) return;
    seeded.current = true;
    onChange(categories.map((c) => emptyQuotationLine(c.id)));
  }, [lines.length, categories, kindName, readonly, loading, onChange]);

  const modeFor = (cat: Category): LineMode => lineMode(kindName, cat.is_customs);

  /** Each line's computed columns, in the order the lines are held. */
  const computed = useMemo(() => {
    const customs = new Map(categories.map((c) => [c.id, c.is_customs]));
    return lines.map((l) =>
      computeLine(l, lineMode(kindName, l.category_id ? !!customs.get(l.category_id) : false)),
    );
  }, [lines, categories, kindName]);

  const totals = useMemo(
    // Only priced lines count: an added-but-unfilled row must not move the
    // total, exactly as `buildQuotation` skips it on save.
    () => headerTotals(computed.filter((_, i) => lines[i]?.item_id), arsp === 'Enabled'),
    [computed, lines, arsp],
  );

  const showCdfSummary = categories.some((c) => modeFor(c) === 'cdf') && totals.totalCdf > 0;

  function patch(index: number, change: Partial<QuotationLine>): void {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...change } : l)));
  }

  function addLine(categoryId: number, afterIndex?: number): void {
    const next = [...lines];
    const at = afterIndex === undefined ? next.length : afterIndex + 1;
    next.splice(at, 0, emptyQuotationLine(categoryId));
    onChange(next);
  }

  function removeLine(index: number): void {
    onChange(lines.filter((_, i) => i !== index));
  }

  /** The descriptions a category offers for the current kind. */
  function itemOptions(categoryId: number): SelectOption[] {
    // 'I' and 'E' mark which side an item may be quoted on. An item with
    // neither letter is offered on both rather than nowhere — legacy rows have
    // a blank type, and hiding them would make old quotations uneditable.
    const wantsExport = modeFor({ id: categoryId, is_customs: false } as Category) === 'export';
    const letter = wantsExport ? 'E' : 'I';
    return items
      .filter((i) => i.category_id === categoryId)
      .filter((i) => i.item_type === '' || i.item_type.toUpperCase().includes(letter))
      .map((i) => ({ value: String(i.id), label: i.name }));
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-8 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!kindName) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Choose a <strong className="text-foreground">Kind</strong> above — it decides which columns a
        quotation line carries.
      </p>
    );
  }

  return (
    <div
      className={`space-y-5 ${invalid ? 'rounded-md ring-2 ring-destructive/40' : ''}`}
      aria-invalid={invalid || undefined}
    >
      {categories.map((cat) => {
        const mode = modeFor(cat);
        const grid = COLUMNS[mode];
        const options = itemOptions(cat.id);
        // Rendered with their ORIGINAL index so edits address the right line.
        const rows = lines
          .map((line, index) => ({ line, index }))
          .filter((r) => r.line.category_id === cat.id);

        return (
          <section key={cat.id} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 rounded-t-lg bg-muted px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {cat.category_header || cat.category_name}
              </h4>
              {mode === 'cdf' && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Billed in CDF
                </span>
              )}
            </div>

            <div className="overflow-x-auto p-3">
              <div style={{ minWidth: mode === 'cdf' ? 900 : 1020 }}>
                <div
                  className="mb-1 grid gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ gridTemplateColumns: grid }}
                >
                  {HEADERS[mode].map((h) => (
                    <div key={h} className={h === 'Description' ? '' : 'text-center'}>
                      {h}
                    </div>
                  ))}
                  <div />
                </div>

                {rows.length === 0 && (
                  <p className="px-1 py-3 text-xs text-muted-foreground">
                    No lines in this category yet.
                  </p>
                )}

                {rows.map(({ line, index }) => {
                  const c = computed[index].values;
                  return (
                    <div
                      key={index}
                      className="mb-1.5 grid items-center gap-2"
                      style={{ gridTemplateColumns: grid }}
                    >
                      {/* §4.36 — every control is inside its track and truncates. */}
                      <SearchableSelect
                        size="sm"
                        value={line.item_id === null ? '' : String(line.item_id)}
                        onChange={(v) => patch(index, { item_id: v ? Number(v) : null })}
                        options={options}
                        placeholder="Select description"
                        emptyLabel="—"
                        aria-label="Description"
                        disabled={readonly}
                      />
                      <SearchableSelect
                        size="sm"
                        value={line.unit_id === null ? '' : String(line.unit_id)}
                        onChange={(v) => patch(index, { unit_id: v ? Number(v) : null })}
                        options={units}
                        placeholder="Unit"
                        emptyLabel="—"
                        aria-label="Unit"
                        disabled={readonly}
                      />

                      {mode === 'standard' && (
                        <>
                          <input
                            type="number" step="0.01" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="Quantity" disabled={readonly}
                            value={line.quantity}
                            onChange={(e) => patch(index, { quantity: e.target.value })}
                          />
                          <input
                            type="number" step="0.01" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="Rate in USD" disabled={readonly}
                            value={line.taux_usd}
                            onChange={(e) => patch(index, { taux_usd: e.target.value })}
                          />
                        </>
                      )}

                      {mode === 'export' && (
                        <>
                          <input
                            type="number" step="0.01" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="Cost in USD" disabled={readonly}
                            value={line.cost_usd}
                            onChange={(e) => patch(index, { cost_usd: e.target.value })}
                          />
                          <Computed value={money(Number(c.subtotalUsd))} />
                        </>
                      )}

                      {mode === 'cdf' ? (
                        <>
                          <input
                            type="number" step="0.01" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="CIF split" disabled={readonly}
                            value={line.cif_split}
                            onChange={(e) => patch(index, { cif_split: e.target.value })}
                          />
                          <input
                            type="number" step="0.0001" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="Percentage" disabled={readonly}
                            value={line.percentage}
                            onChange={(e) => patch(index, { percentage: e.target.value })}
                          />
                          <input
                            type="number" step="0.01" min="0" placeholder="0.00"
                            className="input h-9 min-w-0 text-right font-mono text-xs"
                            aria-label="Rate in CDF" disabled={readonly}
                            value={line.rate_cdf}
                            onChange={(e) => patch(index, { rate_cdf: e.target.value })}
                          />
                          <Computed value={money(Number(c.vatCdf))} />
                          <Computed value={money(Number(c.totalCdf))} tone="cdf" />
                        </>
                      ) : (
                        <>
                          <SearchableSelect
                            size="sm"
                            value={line.currency_id === null ? '' : String(line.currency_id)}
                            onChange={(v) => patch(index, { currency_id: v ? Number(v) : null })}
                            options={currencies}
                            placeholder="CUR"
                            emptyLabel="—"
                            aria-label="Currency"
                            disabled={readonly}
                          />
                          {/* §4.11 — a boolean is a Toggle, never a checkbox. */}
                          <div className="flex justify-center">
                            <Toggle
                              size="sm"
                              checked={line.has_tva}
                              onChange={(v) => patch(index, { has_tva: v })}
                              disabled={readonly}
                              aria-label="Charge TVA on this line"
                            />
                          </div>
                          <Computed value={money(Number(c.tvaUsd))} />
                          <Computed value={money(Number(c.totalUsd))} tone="total" />
                        </>
                      )}

                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => addLine(cat.id, index)}
                          disabled={readonly}
                          title="Insert a line below this one"
                          aria-label="Insert a line below this one"
                          className="btn-neutral btn-icon disabled:opacity-40"
                        >
                          <CornerDownLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          disabled={readonly}
                          title="Remove this line"
                          aria-label="Remove this line"
                          className="ico-delete disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => addLine(cat.id)}
                disabled={readonly}
                className="btn-primary btn-sm disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add Line
              </button>
            </div>
          </section>
        );
      })}

      {/* ---- Summary --------------------------------------------------- */}
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Summary
        </h4>
        <dl className="space-y-1.5 text-sm">
          <Row label="Sub-Total (USD)" value={money(totals.subUsd)} />
          <Row label="VAT (16%)" value={money(totals.vatUsd)} />
          <Row
            label="ARSP (1.2%)"
            value={money(totals.arspAmount)}
            hint={arsp === 'Enabled' ? undefined : 'Disabled on this quotation'}
          />
          <Row label="Total (USD)" value={money(totals.totalUsd)} emphasis />
          {showCdfSummary && (
            <>
              <div className="!mt-3 border-t border-border pt-2" />
              <Row label="Sub-Total (CDF)" value={money(totals.subCdf)} />
              <Row label="VAT (CDF)" value={money(totals.vatCdf)} />
              <Row label="Total (CDF)" value={money(totals.totalCdf)} emphasis />
            </>
          )}
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Recomputed on save from the lines above — the stored totals are the server&rsquo;s own
          arithmetic, never a figure sent from this screen.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
        {label}
        {hint && <span className="ms-2 text-[11px] italic text-muted-foreground">({hint})</span>}
      </dt>
      <dd
        className={`font-mono tabular-nums ${emphasis ? 'text-base font-bold text-foreground' : 'text-foreground'}`}
      >
        {value}
      </dd>
    </div>
  );
}
