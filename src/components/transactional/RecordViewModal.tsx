'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, FileText, Eye, Edit2, FileSpreadsheet } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import { accentFor } from './accents';
import type { PageDef, PageFieldDef, PageFetchResponse } from '@/types';
import { formatDate } from '@/lib/formatDate';

const fmtDate = (v: unknown): string => formatDate(v, '');

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
}


function getString(props: Record<string, unknown> | null, key: string): string | undefined {
  const v = props?.[key];
  return typeof v === 'string' ? v : undefined;
}

// Field types that hold long text and read better spanning the full row.
const WIDE_TYPES = new Set(['textarea', 'seal-picker', 'checkbox-group', 'remark-log']);

export default function RecordViewModal({
  slug,
  entityId,
  title,
  editHref,
  onExport,
  onClose,
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
        className="card w-full max-w-4xl my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
          <h2 className="font-semibold flex items-center gap-2 min-w-0">
            <Eye className="h-5 w-5 shrink-0" />
            <span className="truncate">{title ?? page?.title ?? 'Record Details'}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-white/20 shrink-0"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading details…</div>
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
                          {acc.fields.map((f) => (
                            <div
                              key={f.id}
                              className={WIDE_TYPES.has(f.field_type) ? 'sm:col-span-2 lg:col-span-3' : ''}
                            >
                              <dt className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                                {f.label}
                              </dt>
                              <dd className="mt-0.5 break-words text-sm text-foreground">
                                {renderValue(f)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {editHref && (
            <Link
              href={editHref}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 text-sm font-medium transition"
            >
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
