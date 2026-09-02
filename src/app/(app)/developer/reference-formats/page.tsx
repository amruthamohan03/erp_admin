'use client';

// §4.1 — Developer Options → Reference Formats.
//
// Every auto-generated reference in the app is an ordered list of segments, and
// this screen is where that list is edited. Rearranging the rows turns
// `NMI-IDCOR26-0001` into `IDCOR26-0001-NMI` with no deploy.
//
// The preview is not a mock-up: it calls the same `renderMcaRef` the server calls
// when it writes a real reference (§4.10), so what an operator sees while editing
// is exactly what the next consignment will be called.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import {
  DEFAULT_SEPARATOR,
  MCA_REF_DEFAULTS,
  MCA_REF_TARGETS,
  previewMcaRef,
  renderMcaRef,
  sequenceSegment,
  validateSegments,
  type McaRefSegment,
  type McaRefSegmentType,
  type McaRefTargetKey,
} from '@/lib/mcaRefFormat';

interface FormatRow {
  target_key: McaRefTargetKey;
  format_name: string;
  segments: McaRefSegment[];
  display: 'Y' | 'N';
  is_default: boolean;
  updated_at: string | null;
}

/** What each segment type contributes, in the operator's words. */
const SEGMENT_LABELS: Record<McaRefSegmentType, string> = {
  client: 'Client code',
  kind: 'Kind code',
  goods: 'Type of goods code',
  transport: 'Transport mode letter',
  office: 'Office code',
  year: 'Year',
  literal: 'Fixed text',
  sequence: 'Number (increments)',
};

/** Segments whose value is a master code, so "first N letters" applies. */
const CODE_TYPES: McaRefSegmentType[] = ['client', 'kind', 'goods', 'transport', 'office'];

function defaultSegment(type: McaRefSegmentType): McaRefSegment {
  if (type === 'sequence') return { type, separator: DEFAULT_SEPARATOR, width: 4 };
  if (type === 'year') return { type, separator: DEFAULT_SEPARATOR, digits: 2 };
  if (type === 'literal') return { type, separator: DEFAULT_SEPARATOR, value: '' };
  return { type, separator: DEFAULT_SEPARATOR };
}

export default function ReferenceFormatsPage() {
  const [rows, setRows] = useState<FormatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormatRow | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<FormatRow[]>('/api/v1/mca-ref-formats');
    if (res.ok) setRows(res.data);
    else setResult({ status: 'error', title: 'Not loaded', message: res.message, detail: res.detail });
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Reference Formats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How each auto-generated reference number is put together. A change applies to every
          record created afterwards — references already issued keep the shape they were given.
        </p>
      </div>

      <DataTable<FormatRow>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.target_key}
        searchPlaceholder="Search reference, field, format..."
        emptyMessage="No reference formats are configured — the shipped defaults are in use."
        columns={[
          {
            key: 'format_name',
            header: 'Reference',
            sortable: true,
            className: 'font-medium',
            render: (r) => (
              <div>
                <div className="font-medium text-foreground">{MCA_REF_TARGETS[r.target_key].label}</div>
                <div className="text-xs text-muted-foreground">{MCA_REF_TARGETS[r.target_key].fieldLabel}</div>
              </div>
            ),
            value: (r) => `${MCA_REF_TARGETS[r.target_key].label} ${MCA_REF_TARGETS[r.target_key].fieldLabel}`,
          },
          {
            key: 'preview',
            header: 'Next reference looks like',
            value: (r) => previewMcaRef(r.segments, r.target_key),
            render: (r) => (
              <span className="font-mono font-semibold text-foreground">
                {previewMcaRef(r.segments, r.target_key)}
              </span>
            ),
          },
          {
            key: 'segments',
            header: 'Segments',
            align: 'center',
            value: (r) => r.segments.length,
            render: (r) => <span className="tabular-nums">{r.segments.length}</span>,
          },
          {
            key: 'is_default',
            header: 'Source',
            value: (r) => (r.is_default ? 'Default' : 'Customised'),
            render: (r) =>
              r.is_default ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Default</span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Customised
                </span>
              ),
          },
          {
            key: 'updated_at',
            header: 'Last changed',
            sortable: true,
            render: (r) => <span className="text-muted-foreground">{formatDateTime(r.updated_at)}</span>,
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r) })}
      />

      {editing && (
        <FormatModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            load();
            setResult({
              status: 'success',
              title: 'Saved',
              message: `${name} will use the new format from the next record created.`,
            });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormatModal({
  row,
  onClose,
  onSaved,
}: {
  row: FormatRow;
  onClose: () => void;
  onSaved: (label: string) => void;
}) {
  const meta = MCA_REF_TARGETS[row.target_key];
  const [name, setName] = useState(row.format_name);
  const [segments, setSegments] = useState<McaRefSegment[]>(row.segments);
  const [active, setActive] = useState(row.display === 'Y');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = useMemo(() => validateSegments(segments, row.target_key), [segments, row.target_key]);
  const preview = useMemo(() => renderMcaRef(segments, meta.sample, 1), [segments, meta.sample]);
  const hasSequence = !!sequenceSegment(segments);

  const typeOptions = meta.tokens.map((t) => ({ value: t, label: SEGMENT_LABELS[t] }));

  function patch(i: number, next: Partial<McaRefSegment>) {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...next } : s)));
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= segments.length) return;
    setSegments((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (issues.length > 0) {
      setError(issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);

    const res = await safeFetchJson('/api/v1/mca-ref-formats', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formats: [
          {
            target_key: row.target_key,
            format_name: name,
            segments,
            display: active ? 'Y' : 'N',
          },
        ],
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(`${meta.label} — ${meta.fieldLabel}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="card w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">
              {meta.label} — {meta.fieldLabel}
            </h2>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="ico">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {/* The preview leads, because it is the thing being edited — the segment
              rows below are only the means of getting to it. */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Next reference looks like
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-foreground">{preview ?? '—'}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {hasSequence ? (
                <>
                  The number restarts at 1 for each distinct combination of the other segments — so
                  removing the year segment stops it resetting annually.
                </>
              ) : (
                <>
                  This reference carries no number, so it is not unique on its own. Add a{' '}
                  <em>Number</em> segment if two records could otherwise produce the same reference.
                </>
              )}
            </p>
          </div>

          <div>
            <label className="label required" htmlFor="format_name">Format name</label>
            <input
              id="format_name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={150}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Segments</span>
              <button
                type="button"
                onClick={() => setSegments((p) => [...p, defaultSegment(meta.tokens[0])])}
                className="btn-secondary btn-sm"
              >
                <Plus className="h-4 w-4" /> Add segment
              </button>
            </div>

            {segments.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No segments yet — add the first one to start building the reference.
              </p>
            )}

            <div className="space-y-2">
              {segments.map((seg, i) => {
                const segIssues = issues.filter((x) => x.index === i);
                return (
                  <div
                    key={i}
                    className={`rounded-md border p-3 ${segIssues.length ? 'border-destructive' : 'border-border'}`}
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <span className="flex h-9 w-6 shrink-0 items-center justify-center text-xs font-semibold text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>

                      <div className="min-w-[11rem] flex-1">
                        <label className="label text-xs">Segment</label>
                        <SearchableSelect
                          size="sm"
                          value={seg.type}
                          onChange={(v) => setSegments((prev) =>
                            prev.map((s, idx) => (idx === i ? { ...defaultSegment(v as McaRefSegmentType), separator: s.separator } : s)),
                          )}
                          options={typeOptions}
                          aria-label={`Segment ${i + 1} type`}
                        />
                      </div>

                      {/* The first segment has nothing in front of it, so its
                          separator would silently do nothing — say so rather than
                          letting someone type a leading dash that never appears. */}
                      <div className="w-28">
                        <label className="label text-xs">Joined by</label>
                        <input
                          className="input"
                          value={i === 0 ? '' : seg.separator ?? DEFAULT_SEPARATOR}
                          onChange={(e) => patch(i, { separator: e.target.value })}
                          disabled={i === 0}
                          maxLength={5}
                          placeholder={i === 0 ? 'first' : 'none'}
                          aria-label={`Separator before segment ${i + 1}`}
                        />
                      </div>

                      {seg.type === 'literal' && (
                        <div className="w-32">
                          <label className="label required text-xs">Text</label>
                          <input
                            className="input"
                            value={seg.value ?? ''}
                            onChange={(e) => patch(i, { value: e.target.value })}
                            required
                            maxLength={20}
                            aria-label={`Fixed text for segment ${i + 1}`}
                          />
                        </div>
                      )}

                      {seg.type === 'year' && (
                        <div className="w-32">
                          <label className="label text-xs">Digits</label>
                          <SearchableSelect
                            size="sm"
                            value={String(seg.digits ?? 2)}
                            onChange={(v) => patch(i, { digits: Number(v) })}
                            options={[
                              { value: '2', label: '2 — 26' },
                              { value: '4', label: '4 — 2026' },
                            ]}
                            aria-label={`Year digits for segment ${i + 1}`}
                          />
                        </div>
                      )}

                      {seg.type === 'sequence' && (
                        <div className="w-28">
                          <label className="label text-xs">Digits</label>
                          <input
                            type="number"
                            className="input"
                            value={seg.width ?? 4}
                            onChange={(e) => patch(i, { width: Number(e.target.value) })}
                            min={1}
                            max={10}
                            aria-label={`Number width for segment ${i + 1}`}
                          />
                        </div>
                      )}

                      {CODE_TYPES.includes(seg.type) && (
                        <div className="w-28">
                          <label className="label text-xs">First letters</label>
                          <input
                            type="number"
                            className="input"
                            value={seg.letters ?? ''}
                            onChange={(e) =>
                              patch(i, { letters: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                            min={1}
                            max={20}
                            placeholder="all"
                            aria-label={`Letters kept for segment ${i + 1}`}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-1 pb-0.5">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          title="Move up"
                          className="ico disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === segments.length - 1}
                          title="Move down"
                          className="ico disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSegments((p) => p.filter((_, idx) => idx !== i))}
                          title="Remove segment"
                          className="ico-delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {segIssues.map((x, k) => (
                      <p key={k} className="mt-2 text-xs text-destructive">{x.message}</p>
                    ))}
                  </div>
                );
              })}
            </div>

            {issues.filter((x) => x.index === null).map((x, k) => (
              <p key={k} className="mt-2 text-xs text-destructive">{x.message}</p>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <Toggle
              checked={active}
              onChange={setActive}
              label="Active — when off, the shipped default is used"
            />
            <button
              type="button"
              onClick={() => setSegments(MCA_REF_DEFAULTS[row.target_key])}
              className="btn-secondary btn-sm"
            >
              <RotateCcw className="h-4 w-4" /> Restore default
            </button>
          </div>

          {/* §4.21 — a labelled way out, in every mode. */}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || issues.length > 0} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
