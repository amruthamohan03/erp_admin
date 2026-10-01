'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, FileText, Eye, Edit2, FileSpreadsheet } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import { accentFor } from './accents';
import type { PageDef, PageFieldDef, PageFetchResponse } from '@/types';
import { formatDate } from '@/lib/formatDate';
import { companionOf } from '@/lib/pages/companion';

const fmtDate = (v: unknown): string => formatDate(v, '');

/** Two decimals with separators, the way every amount in this app is read. */
const money = (v: unknown): string => {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// A read-only "beautiful" record viewer for any transactional page. Instead of
// re-rendering the edit form with disabled inputs, it reuses the exact same
// config the form uses — /api/v1/pages/<slug>?entity_id=<id> returns the
// accordions + fields (labels, types) already filtered by the role's grants,
// plus the entity's current values — and lays it out as labelled read-only
// cells grouped by accordion. Because it is fully master-driven, one component
// serves clients / licenses / imports / exports without per-page code.

interface RecordViewModalProps {
  // master_page slug: 'clients' | 'license' | 'import' | 'export' | …
  slug: string;
  entityId: number | string;
  // Optional heading override; defaults to the page title.
  title?: string;
  // Optional footer actions. When set, an Edit link / Export button render
  // alongside Close so the viewer doubles as the row's action hub.
  editHref?: string;
  onExport?: () => void;
  onClose: () => void;
  /**
   * The line under the title, naming WHICH record is open.
   *
   * Optional because it is derived when omitted — see `IDENTITY_FIELDS`. A
   * caller that knows better (a joined client name the form's values do not
   * hold) passes its own.
   */
  headline?: string;
  /**
   * Module-specific content rendered after the accordions.
   *
   * For state that belongs to the record but is NOT a form field, and so has no
   * page config to be rendered from: the payment request's approval trail is the
   * live case — who approved which stage, when, and what they wrote. That is the
   * half of a payment request people open the viewer to read, and it can never
   * appear through `page.accordions` because it is workflow state, not input.
   *
   * A slot rather than a per-module branch inside this component: every approval
   * chain will want the same thing, and the alternative is this file growing a
   * `slug === 'payment'` case (§4.8).
   */
  extra?: React.ReactNode;
}


/**
 * The fields that NAME a record, best first.
 *
 * A vetted list rather than a guess: the viewer serves every transactional page
 * from one component, so it cannot know which field is the identity without
 * being told, and picking "the first text field" would put a commodity
 * description in the header as often as a reference.
 *
 * Every one of these is a reference an operator says out loud. Client is last
 * because it names the counterparty rather than the record (§4.15 — as a column
 * on someone else's row, the client is the short code).
 */
const IDENTITY_FIELDS = [
  'mca_ref',
  'mca_lt_reference',
  'invoice_ref',
  'quotation_ref',
  'license_number',
  'company_name',
  'short_name',
] as const;

function getString(props: Record<string, unknown> | null, key: string): string | undefined {
  const v = props?.[key];
  return typeof v === 'string' ? v : undefined;
}

// Field types that hold long text and read better spanning the full row.
const WIDE_TYPES = new Set([
  'textarea', 'seal-picker', 'checkbox-group', 'remark-log', 'mca-grid', 'quotation-items', 'fiche-items',
]);


export default function RecordViewModal({
  slug,
  entityId,
  title,
  editHref,
  onExport,
  onClose,
  extra,
  headline: headlineProp,
}: RecordViewModalProps): React.ReactElement {
  const [page, setPage] = useState<PageDef | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Resolved labels for dynamic selects, keyed `${fieldName}:${value}`.
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape — matches the other modals in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await safeFetchJson<PageFetchResponse>(
        `/api/v1/pages/${slug}?entity_id=${entityId}`,
      );
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        setLoading(false);
        return;
      }
      setPage(res.data.page);
      setValues(res.data.values ?? {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, entityId]);

  // Resolve dynamic-select ids to human labels once the page def is known.
  // Fetches each distinct options_source once, then builds a per-field
  // value→label map (a source shared by two fields with different label
  // templates still resolves correctly).
  useEffect(() => {
    if (!page) return;
    const selectFields = page.accordions
      .flatMap((a) => a.fields)
      .filter((f) => f.field_type === 'select' && f.options_source);
    if (selectFields.length === 0) return;

    let cancelled = false;
    (async () => {
      const sourceRows = new Map<string, Promise<Record<string, unknown>[]>>();
      const fetchSource = (src: string): Promise<Record<string, unknown>[]> => {
        const existing = sourceRows.get(src);
        if (existing) return existing;
        // pageSize=100 is the universal cap the list-query schemas accept.
        // `src` may already carry a query string (e.g. 'kinds?group=import') — join
        // with & in that case so we don't emit a malformed double '?'.
        const p = fetch(`/api/v1/${src}${src.includes('?') ? '&' : '?'}pageSize=100`)
          .then((r) => r.json())
          .then((j) => {
            if (!j?.ok) return [];
            return Array.isArray(j.data)
              ? (j.data as Record<string, unknown>[])
              : Array.isArray(j.data?.items)
                ? (j.data.items as Record<string, unknown>[])
                : [];
          })
          .catch(() => []);
        sourceRows.set(src, p);
        return p;
      };

      const labels: Record<string, string> = {};
      await Promise.all(
        selectFields.map(async (f) => {
          const rows = await fetchSource(f.options_source as string);
          const labelField = f.options_label_field ?? 'name';
          const labelTemplate = getString(f.props, 'labelTemplate');
          for (const row of rows) {
            const id = row['id'];
            const label = labelTemplate
              ? labelTemplate.replace(/\{(\w+)\}/g, (_, k: string) => String(row[k] ?? ''))
              : String(row[labelField] ?? row[labelField.replace('_', '')] ?? id);
            labels[`${f.name}:${String(id)}`] = label;
          }
        }),
      );
      if (!cancelled) setOptionLabels(labels);
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // Derived once the values arrive; a caller's own headline always wins.
  const headline =
    headlineProp ??
    (() => {
      for (const name of IDENTITY_FIELDS) {
        const v = values[name];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return undefined;
    })();

  function renderValue(f: PageFieldDef): React.ReactNode {
    const v = values[f.name];
    if (v === null || v === undefined || v === '') {
      return <span className="text-muted-foreground">—</span>;
    }

    switch (f.field_type) {
      case 'select': {
        const stat = f.options_static?.find((o) => String(o.value) === String(v));
        if (stat) return stat.label;
        return optionLabels[`${f.name}:${String(v)}`] ?? String(v);
      }
      case 'date':
        return fmtDate(String(v));
      case 'file':
        return (
          <a
            href={`/api/v1/files/${v}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            <FileText className="h-4 w-4" /> View File
          </a>
        );
      case 'checkbox-group': {
        const opts = f.options_static ?? [];
        const joinChar = getString(f.props, 'joinChar') ?? '';
        const set = new Set(String(v).split(joinChar).filter(Boolean));
        const picked = opts.filter((o) => set.has(o.value)).map((o) => o.label);
        return picked.length ? picked.join(', ') : <span className="text-muted-foreground">—</span>;
      }
      // A dated log reads as a list, not as one run-on line.
      case 'remark-log': {
        const lines = Array.isArray(v) ? (v as Array<{ date?: string; remark?: string }>) : [];
        if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <ul className="space-y-1">
            {lines.map((line, i) => (
              <li key={`${line.date ?? ''}-${i}`} className="flex gap-2">
                <span className="shrink-0 font-medium text-muted-foreground">{fmtDate(String(line.date ?? ''))}</span>
                <span className="whitespace-pre-wrap break-words">{line.remark ?? ''}</span>
              </li>
            ))}
          </ul>
        );
      }
      // §4.5 — a repeating JSONB group reads as its rows, not as its JSON. Without
      // this case the default branch stringified the array, so the payment
      // request's references came out as "[object Object],[object Object]" —
      // which is exactly what the viewer is opened to read.
      // §2 step 3 — a fiche's lines, with the figures the save computed.
      case 'fiche-items': {
        const lines = Array.isArray(v)
          ? (v as Array<{ numero?: number; description?: string; position_tarif?: string; ddi_percent?: number; fob_article?: number; cif_article?: number; ddi?: number }>)
          : [];
        if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
        const sum = (k: 'fob_article' | 'cif_article' | 'ddi'): number => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
        return (
          <div className="overflow-x-auto">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Description</th>
                  <th>Position tarifaire</th>
                  <th className="text-right">DDI %</th>
                  <th className="text-right">FOB</th>
                  <th className="text-right">CIF</th>
                  <th className="text-right">DDI (FC)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-muted-foreground">{l.numero ?? i + 1}</td>
                    <td>{l.description || '—'}</td>
                    <td className="font-mono">{l.position_tarif || '—'}</td>
                    <td className="text-right tabular-nums">{money(l.ddi_percent)}</td>
                    <td className="text-right tabular-nums">{money(l.fob_article)}</td>
                    <td className="text-right tabular-nums">{money(l.cif_article)}</td>
                    <td className="text-right tabular-nums">{money(l.ddi)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td />
                  <td colSpan={3}>Total</td>
                  <td className="text-right tabular-nums">{money(sum('fob_article'))}</td>
                  <td className="text-right tabular-nums">{money(sum('cif_article'))}</td>
                  <td className="text-right tabular-nums">{money(sum('ddi'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      }
      case 'mca-grid': {
        const lines = Array.isArray(v) ? (v as Array<{ mca_ref?: string; amount?: number }>) : [];
        if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
        const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
        return (
          <div className="overflow-x-auto">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={`${line.mca_ref ?? ''}-${i}`}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    <td className="font-mono">{line.mca_ref ?? '—'}</td>
                    <td className="text-right tabular-nums">{money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td />
                  <td>Total</td>
                  <td className="text-right tabular-nums">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      }
      // §4.5 — a quotation's priced lines read as a table. Without this case the
      // default branch stringifies the array, which is what the payment grid did
      // before it was given one.
      case 'quotation-items': {
        const lines = Array.isArray(v)
          ? (v as Array<Record<string, unknown>>)
          : [];
        const priced = lines.filter((l) => l.item_id);
        if (priced.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="overflow-x-auto">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-center">TVA</th>
                </tr>
              </thead>
              <tbody>
                {priced.map((l, i) => (
                  <tr key={i}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    {/* The id, because the viewer holds the form's values and
                        not the joined master names. The detail endpoint is
                        where a named line list comes from. */}
                    <td className="font-mono">#{String(l.item_id)}</td>
                    <td className="text-right tabular-nums">{money(l.quantity ?? 1)}</td>
                    <td className="text-right tabular-nums">
                      {money(l.rate_cdf || l.cost_usd || l.taux_usd)}
                    </td>
                    <td className="text-center">{l.has_tva ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'textarea':
        return <span className="whitespace-pre-wrap">{String(v)}</span>;
      default:
        return String(v);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card my-auto flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — `.bg-brand-gradient`, so it follows the operator's
            configured palette and darkens with the theme like the app's own
            chrome does (§4.20, §4.32). It used to be a hardcoded indigo→purple,
            which ignored both. */}
        <div className="flex shrink-0 items-start justify-between gap-3 bg-brand-gradient px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Eye className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-tight">
                {title ?? page?.title ?? 'Record Details'}
              </h2>
              {/* The record's own identity, so the dialog says WHICH record it
                  is showing rather than only what kind. */}
              <p className="mt-0.5 truncate text-xs text-white/75">
                {headline ?? (loading ? 'Loading…' : `Record #${entityId}`)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white"
            title="Close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* §4.25's rule for a loading state, applied here: skeletons that hold
              the shape, never a bare line of text that collapses the dialog to
              nothing and then jumps when the data lands. */}
          {loading && (
            <div className="space-y-6">
              {Array.from({ length: 2 }, (_, s) => (
                <section key={s} className="overflow-hidden rounded-xl border border-border">
                  <div className="h-1 w-full bg-muted" />
                  <div className="flex items-center gap-2.5 bg-muted/40 px-4 py-2.5">
                    <span className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                    <span className="h-4 w-40 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
              {error}
            </div>
          )}

          {!loading && !error && page && (
            <div className="space-y-6">
              {page.accordions.map((acc, idx) => {
                const accent = accentFor(idx);
                return (
                  <section
                    key={acc.id}
                    className="rounded-xl border border-border overflow-hidden"
                  >
                    <div className={`h-1 w-full bg-gradient-to-r ${accent.bar}`} />
                    <div className={`flex items-center gap-2.5 px-4 py-2.5 ${accent.tint}`}>
                      <span
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg text-white shadow-sm bg-gradient-to-br ${accent.chip}`}
                      >
                        {acc.icon ? <i className={`${acc.icon} text-base leading-none`} /> : null}
                      </span>
                      <h3 className={`font-semibold ${accent.title}`}>{acc.title}</h3>
                    </div>
                    <div className="p-4">
                      {acc.fields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No fields.</p>
                      ) : (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                          {/* An amount and its currency are one value (§4.1
                              props.currencyField) — read together here for the same
                              reason they are typed together on the form. */}
                          {(() => {
                            const mates = new Map<string, PageFieldDef>();
                            for (const f of acc.fields) {
                              const name = companionOf(f.props);
                              const mate = name ? acc.fields.find((x) => x.name === name) : undefined;
                              if (mate) mates.set(f.name, mate);
                            }
                            const consumed = new Set([...mates.values()].map((m) => m.name));
                            return acc.fields
                              // The invoice file picker only edits the grid's
                              // value — the grid is what the view shows.
                              .filter((f) => !consumed.has(f.name) && f.field_type !== 'invoice-files')
                              .map((f) => {
                                const mate = mates.get(f.name);
                                return (
                                  <div
                                    key={f.id}
                                    // A cell with its own surface and left rule,
                                    // so a dense grid reads as discrete values
                                    // rather than as text floating in a column.
                                    className={`rounded-lg border-l-2 border-border bg-muted/30 px-3 py-2 ${
                                      WIDE_TYPES.has(f.field_type) ? 'sm:col-span-2 lg:col-span-3' : ''
                                    }`}
                                  >
                                    {/* §4.30 — the label is supporting text and
                                        the VALUE carries the weight. It was the
                                        other way round: a bold black label above
                                        a lighter value, which made every screen
                                        read as a list of captions. */}
                                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {f.label}
                                    </dt>
                                    <dd className="mt-1 break-words text-sm font-medium text-foreground">
                                      {renderValue(f)}
                                      {mate && (
                                        <span className="ml-1.5 font-normal text-muted-foreground">
                                          {renderValue(mate)}
                                        </span>
                                      )}
                                    </dd>
                                  </div>
                                );
                              });
                          })()}
                        </dl>
                      )}
                    </div>
                  </section>
                );
              })}

              {/* Record state that is not a form field — see `extra` above. */}
              {extra}
            </div>
          )}
        </div>

        {/* Footer — shrink-0 so it stays put while the body scrolls, and the
            shared button classes rather than a hand-rolled colour (§4.20). */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-5 py-3">
          {editHref && (
            <Link href={editHref} className="btn-edit btn-sm">
              <Edit2 className="h-4 w-4" /> Edit
            </Link>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="btn-excel btn-sm"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
