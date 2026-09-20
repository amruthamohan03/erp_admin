'use client';

// §2 step 3 — a Fiche de Calcul's lines, rendered INSIDE the transaction page by
// FieldRenderer (`field_type: 'fiche-items'`, a JSONB column — §4.5). The
// page's one Save writes them with the header (§4.17).
//
// Laid out as main's "Items Management": one row per line, "Add Item", and "Get
// Position Tarifs", which adds a line per HS code picked from Masters → HS Codes
// with its DDI %.
//
// Every figure the fiche computes — the header's CIF and coefficient, each
// line's coefficient, CIF and DDI — comes from src/lib/fiche/calc.ts evaluating
// the tax_rule_master_t formulas (§4.2). The grid previews them and writes CIF
// and coefficient back into the header through the page's change path; the save
// route recomputes all of it, so nothing typed into a total is trusted.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Plus, Search, Trash2, X } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import {
  computeFiche,
  emptyFicheItem,
  normaliseFicheItem,
  FicheRuleError,
  type FicheComputed,
  type FicheRules,
} from '@/lib/fiche/calc';
import type { FicheItem } from '@/db/schema/fiche';

interface FicheItemsGridProps {
  value: FicheItem[];
  onChange: (items: FicheItem[]) => void;
  readonly?: boolean;
  /** The header — FOB, charges, rates, currency, regime, provenance, file. */
  values: Record<string, unknown>;
  /** Write header fields the lines determine (CIF, coefficient). */
  onFieldsChange?: (patch: Record<string, unknown>) => void;
  invalid?: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const fmt = (n: number, places = 2): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });

type TextKey = 'description' | 'no_bivac' | 'position_tarif' | 'description_tarif' | 'av' | 'org' | 'prov' | 'code_add';
type NumKey = 'ddi_percent' | 'colis' | 'qte' | 'net' | 'brut' | 'fob_article';

/** Editable columns in main's order; computed and header-driven ones sit between. */
const COLUMNS: { key: keyof FicheItem; label: string; kind: 'text' | 'number' | 'fixed' | 'computed'; width: string }[] = [
  { key: 'description', label: 'Description sur facture', kind: 'text', width: 'min-w-[160px]' },
  { key: 'no_bivac', label: 'N° BIVAC', kind: 'text', width: 'min-w-[100px]' },
  { key: 'no_facture', label: 'N° Facture', kind: 'fixed', width: 'min-w-[100px]' },
  { key: 'numero', label: 'N°', kind: 'fixed', width: 'min-w-[48px]' },
  { key: 'position_tarif', label: 'Position tarifaire', kind: 'text', width: 'min-w-[130px]' },
  { key: 'ddi_percent', label: 'DDI %', kind: 'number', width: 'min-w-[80px]' },
  { key: 'description_tarif', label: 'Description tarif', kind: 'text', width: 'min-w-[150px]' },
  { key: 'av', label: 'AV', kind: 'text', width: 'min-w-[70px]' },
  { key: 'org', label: 'ORG', kind: 'text', width: 'min-w-[70px]' },
  { key: 'prov', label: 'PROV', kind: 'text', width: 'min-w-[70px]' },
  { key: 'regime', label: 'Régime', kind: 'fixed', width: 'min-w-[90px]' },
  { key: 'code_add', label: 'Code add', kind: 'text', width: 'min-w-[90px]' },
  { key: 'colis', label: 'Colis', kind: 'number', width: 'min-w-[80px]' },
  { key: 'qte', label: 'Qté', kind: 'number', width: 'min-w-[80px]' },
  { key: 'net', label: 'Poids net', kind: 'number', width: 'min-w-[100px]' },
  { key: 'brut', label: 'Poids brut', kind: 'number', width: 'min-w-[100px]' },
  { key: 'fob_article', label: 'FOB par article', kind: 'number', width: 'min-w-[120px]' },
  { key: 'coef', label: 'Coef', kind: 'computed', width: 'min-w-[90px]' },
  { key: 'cif_article', label: 'CIF par article', kind: 'computed', width: 'min-w-[130px]' },
  { key: 'ddi', label: 'DDI en FC', kind: 'computed', width: 'min-w-[130px]' },
];

interface HsCode {
  id: number;
  hscode_number: string;
  hscode_ddi: string | number | null;
}

/** One figure of the running calculation, read at a glance above the lines. */
function Chip({ label, value, tone }: { label: string; value: string; tone?: 'brand' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        tone === 'brand' ? 'border-primary-100 bg-primary-50 text-primary-700' : 'border-border bg-muted text-foreground'
      }`}
    >
      <span className="uppercase tracking-wide opacity-70">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </span>
  );
}

export default function FicheItemsGrid({ value, onChange, readonly = false, values, onFieldsChange, invalid }: FicheItemsGridProps) {
  const [rules, setRules] = useState<FicheRules | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<Map<number, string>>(new Map());
  const [regimes, setRegimes] = useState<Map<number, string>>(new Map());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [tarifsOpen, setTarifsOpen] = useState(false);

  const items = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  useEffect(() => {
    let live = true;
    void safeFetchJson<FicheRules>('/api/v1/fiches/rules').then((r) => {
      if (!live) return;
      if (r.ok) setRules(r.data);
      else setRuleError(r.message);
    });
    void fetchMasterOptions('currencies', 'currency_short_name').then((rows) => {
      if (live) setCurrencies(new Map(rows.map((c) => [Number(c.id), c.label.trim().toUpperCase()])));
    });
    void fetchMasterOptions('regimes', 'regime_name').then((rows) => {
      if (live) setRegimes(new Map(rows.map((c) => [Number(c.id), c.label])));
    });
    return () => {
      live = false;
    };
  }, []);

  // N° Facture is the file's commercial invoice — main copies it onto every line.
  const licenseId = toId(values['license_id']);
  const importId = toId(values['import_id']);
  useEffect(() => {
    if (!licenseId || !importId) {
      setInvoiceNo('');
      return;
    }
    let live = true;
    void safeFetchJson<{ id: number; invoice: string | null }[]>(
      `/api/v1/fiches/files?license_id=${licenseId}&current=${importId}`,
    ).then((r) => {
      if (live && r.ok) setInvoiceNo(r.data.find((f) => f.id === importId)?.invoice ?? '');
    });
    return () => {
      live = false;
    };
  }, [licenseId, importId]);

  const currencyId = toId(values['currency_id']);
  const currencyCode = currencyId ? currencies.get(currencyId) ?? '' : 'USD';
  const regimeName = (() => {
    const id = toId(values['regime_id']);
    return id ? regimes.get(id) ?? '' : '';
  })();
  const provence = String(values['provence'] ?? '');

  // The header-driven cells, stamped onto every line: the file's invoice and
  // regime (read-only, as in main) and the provenance, which main re-copied to
  // every line whenever it changed.
  const stamped = useCallback(
    (list: FicheItem[], prov: string | null): FicheItem[] =>
      list.map((it) => ({
        ...it,
        no_facture: invoiceNo || it.no_facture,
        regime: regimeName || it.regime,
        prov: prov ?? it.prov,
      })),
    [invoiceNo, regimeName],
  );

  const computed: FicheComputed | null = useMemo(() => {
    if (!rules) return null;
    try {
      return computeFiche(
        {
          fob: num(values['fob']),
          fret: num(values['fret']),
          insurance: num(values['insurance_amount']),
          autres_charges: num(values['autres_charges']),
          usd_rate: num(values['usd_to_currency_rate']) || 1,
          tx_de_change: num(values['tx_de_change']),
          is_usd: currencyCode === 'USD',
        },
        items,
        rules,
      );
    } catch (e) {
      if (e instanceof FicheRuleError) return null;
      throw e;
    }
  }, [rules, values, items, currencyCode]);

  const computeError = rules && !computed ? 'A fiche formula is misconfigured — check Masters → Tax Rules (fiche.*).' : null;

  // Keep the stored value in step with what it computes to: the line figures
  // and the stamped header cells. Only writes when something actually differs,
  // so opening a saved fiche does not mark it changed.
  const lastProvence = useRef(provence);
  useEffect(() => {
    if (!computed || readonly) return;
    const provChanged = lastProvence.current !== provence;
    lastProvence.current = provence;
    const next = stamped(computed.items, provChanged ? provence : null);
    if (JSON.stringify(next) !== JSON.stringify(items)) onChange(next);
    if (onFieldsChange && (num(values['cif']) !== computed.cif || num(values['coefficient']) !== computed.coefficient)) {
      onFieldsChange({ cif: computed.cif, coefficient: computed.coefficient });
    }
  }, [computed, stamped, provence, items, onChange, onFieldsChange, readonly, values]);

  // A fresh fiche starts with one line, as main's form did.
  useEffect(() => {
    if (!readonly && items.length === 0) onChange([emptyFicheItem(0)]);
  }, [items.length, readonly, onChange]);

  const setCell = (idx: number, key: TextKey | NumKey, raw: string): void => {
    onChange(
      items.map((it, i) => {
        if (i !== idx) return it;
        const numeric = COLUMNS.find((c) => c.key === key)?.kind === 'number';
        return { ...it, [key]: numeric ? num(raw) : raw };
      }),
    );
  };

  const newLine = (i: number, over: Partial<FicheItem> = {}): FicheItem => ({
    ...emptyFicheItem(i),
    no_facture: invoiceNo,
    regime: regimeName,
    prov: provence,
    ...over,
  });

  const addLine = (): void => onChange([...items, newLine(items.length)]);
  const removeLine = (idx: number): void => {
    // main keeps at least one line: a fiche with none calculates nothing.
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== idx).map((it, i) => normaliseFicheItem(it, i)));
  };
  const addTarifs = (codes: HsCode[]): void => {
    // A lone untouched starter line is replaced rather than left blank above them.
    const base = items.length === 1 && !items[0]?.position_tarif && !items[0]?.fob_article && !items[0]?.description ? [] : items;
    onChange([
      ...base,
      ...codes.map((c, i) => newLine(base.length + i, { position_tarif: c.hscode_number, ddi_percent: num(c.hscode_ddi) })),
    ]);
  };

  const shown = computed?.items ?? items;
  const totals = computed?.totals;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {computed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip label="CIF" value={`${fmt(computed.cif)} ${currencyCode}`} tone="brand" />
            <Chip label="Coefficient" value={fmt(computed.coefficient, 6)} />
            <Chip label="Lines" value={String(shown.length)} />
            <Chip label="Total DDI (FC)" value={fmt(totals?.ddi ?? 0)} tone="brand" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ruleError ?? computeError ?? 'Loading the fiche formulas…'}</p>
        )}
        {!readonly && (
          <div className="flex gap-2">
            <button type="button" onClick={addLine} className="btn-create btn-sm">
              <Plus className="h-4 w-4" /> Add Item
            </button>
            <button type="button" onClick={() => setTarifsOpen(true)} className="btn-neutral btn-sm">
              <Barcode className="h-4 w-4" /> Get Position Tarifs
            </button>
          </div>
        )}
      </div>

      <div className={`max-h-[500px] overflow-auto rounded-md border ${invalid ? 'border-destructive' : 'border-border'}`}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-brand-gradient text-white">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`${c.width} whitespace-nowrap px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wide`}>
                  {c.label}
                </th>
              ))}
              {!readonly && <th className="w-12 px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wide">Action</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((it, idx) => (
              <tr key={idx} className={`border-b border-border hover:bg-muted/50 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                {COLUMNS.map((c) => {
                  const v = it[c.key];
                  if (c.kind === 'computed' || c.kind === 'fixed' || readonly) {
                    const text =
                      typeof v === 'number'
                        ? c.key === 'numero'
                          ? String(v)
                          : fmt(v, c.key === 'coef' ? 6 : 2)
                        : String(v ?? '');
                    return (
                      <td
                        key={c.key}
                        className={`px-1.5 py-1 ${typeof v === 'number' ? 'text-right tabular-nums' : ''} ${c.kind === 'computed' ? 'bg-primary-50/60 font-semibold text-foreground' : ''}`}
                        title={text}
                      >
                        <span className="block truncate">{text || '—'}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        className="input h-8 min-w-0 w-full px-1.5 text-xs"
                        type={c.kind === 'number' ? 'number' : 'text'}
                        step={c.kind === 'number' ? '0.01' : undefined}
                        value={c.kind === 'number' ? (num(v) === 0 ? '' : String(v)) : String(v ?? '')}
                        placeholder={c.kind === 'number' ? '0.00' : c.label}
                        onChange={(e) => setCell(idx, c.key as TextKey | NumKey, e.target.value)}
                        aria-label={`${c.label}, line ${idx + 1}`}
                      />
                    </td>
                  );
                })}
                {!readonly && (
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={items.length <= 1}
                      title={items.length <= 1 ? 'A fiche keeps at least one line' : 'Remove this line'}
                      aria-label={`Remove line ${idx + 1}`}
                      className="ico-delete disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot className="sticky bottom-0 bg-muted font-bold">
              <tr>
                <td colSpan={12} className="px-1.5 py-2 text-right text-foreground">TOTALS</td>
                {[totals.colis, totals.qte, totals.net, totals.brut, totals.fob].map((t, i) => (
                  <td key={i} className="px-1.5 py-2 text-right tabular-nums text-foreground">{fmt(t)}</td>
                ))}
                <td />
                <td className="px-1.5 py-2 text-right tabular-nums text-foreground">{fmt(totals.cif)}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-foreground">{fmt(totals.ddi)}</td>
                {!readonly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {tarifsOpen && <PositionTarifsModal onClose={() => setTarifsOpen(false)} onApply={(codes) => { addTarifs(codes); setTarifsOpen(false); }} />}
    </div>
  );
}

/** main's "Select Position Tarifs": pick HS codes, each becomes a line with its DDI %. */
function PositionTarifsModal({ onClose, onApply }: { onClose: () => void; onApply: (codes: HsCode[]) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<HsCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<number, HsCode>>(new Map());

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      const p = new URLSearchParams({ pageSize: '100' });
      if (q.trim()) p.set('q', q.trim());
      void safeFetchJson<HsCode[]>(`/api/v1/hscodes?${p}`).then((r) => {
        if (!live) return;
        setLoading(false);
        if (r.ok) {
          setRows(r.data);
          setError(null);
        } else setError(r.message);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (r: HsCode, on: boolean): void =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(r.id, r);
      else next.delete(r.id);
      return next;
    });
  // Scoped to what the search shows, so the search box can scope a bulk pick.
  const toggleAll = (on: boolean): void =>
    setPicked((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (on) next.set(r.id, r);
        else next.delete(r.id);
      }
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="tarifs-title">
      <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="tarifs-title" className="font-semibold text-foreground">Select Position Tarifs</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Each HS code picked adds a line with its Position Tarifaire and DDI %. Codes and rates come from Masters → HS Codes.
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input pl-8" placeholder="Search HS code..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search HS code" />
          </div>
          <p className="text-xs text-muted-foreground">{picked.size} selected</p>
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-14 border-b border-border px-2 py-2 text-center">
                  <Toggle size="sm" checked={allOn} onChange={toggleAll} aria-label="Select every code shown" />
                </th>
                <th className="border-b border-border px-2 py-2 text-left text-foreground">Position Tarif</th>
                <th className="border-b border-border px-2 py-2 text-right text-foreground">DDI (%)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">Loading HS codes…</td></tr>
              ) : error ? (
                <tr><td colSpan={3} className="px-2 py-4 text-center text-destructive">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">No HS code matches — add codes under Masters → HS Codes.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-2 py-1.5 text-center">
                      <Toggle size="sm" checked={picked.has(r.id)} onChange={(on) => toggle(r, on)} aria-label={`Select ${r.hscode_number}`} />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-foreground">{r.hscode_number}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{fmt(num(r.hscode_ddi))}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" disabled={picked.size === 0} onClick={() => onApply([...picked.values()])} className="btn-primary">
            Apply Selected Tarifs
          </button>
        </div>
      </div>
    </div>
  );
}
