'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { formatDate } from '@/lib/formatDate';
import { LAYOUTS, type LayoutKey, type TemplateOptions } from '@/lib/invoiceTemplates/types';

// §4.1 — the invoice PDF designs, as rows an operator maintains.
//
// The form previews itself: every change re-renders the sample facture through
// the SAME endpoint the real invoice prints with (§4.10), so an accent colour
// or a hidden block is seen before it is saved rather than discovered on a
// document already sent to a client.

interface Row {
  id: number;
  template_code: string;
  template_name: string;
  description: string | null;
  layout: LayoutKey;
  options: TemplateOptions;
  is_default: boolean;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const LAYOUT_NAME = new Map(LAYOUTS.map((l) => [l.key, l.name]));

export default function InvoiceTemplatesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/invoice-templates?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
        setLoadError(null);
      } else {
        // A failed load must not render as an empty table — "no templates yet"
        // and "the server did not answer" look identical on screen.
        setItems([]);
        setTotal(0);
        setLoadError(json.error?.message || 'The invoice templates could not be loaded.');
      }
    } catch {
      setItems([]);
      setTotal(0);
      setLoadError('The invoice templates could not be loaded. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(row: Row) {
    if (!confirm(`Disable the template “${row.template_name}”?`)) return;
    const res = await fetch(`/api/v1/invoice-templates/${row.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({
        status: 'error',
        title: 'Not deleted',
        message: json.error?.message || 'This template could not be disabled.',
      });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: 'The template has been disabled. Invoices drawn with it now print the default.',
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Invoice Template</h1>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search code, name, description, layout..."
        emptyMessage="No invoice templates yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Template
          </button>
        }
        columns={[
          { key: 'template_code', header: 'Code', sortable: true, className: 'font-mono' },
          { key: 'template_name', header: 'Template', sortable: true },
          {
            key: 'layout',
            header: 'Layout',
            sortable: true,
            value: (r) => LAYOUT_NAME.get(r.layout) ?? r.layout,
            render: (r) => LAYOUT_NAME.get(r.layout) ?? r.layout,
          },
          {
            key: 'accent',
            header: 'Accent',
            // The colour is the thing that distinguishes two rows sharing a
            // layout, so it is shown rather than described.
            render: (r) => {
              const c = r.options?.accentColor ?? '#111111';
              return (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ background: c }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">{c}</span>
                </span>
              );
            },
          },
          {
            key: 'is_default',
            header: 'Default',
            align: 'center' as const,
            sortable: true,
            value: (r) => (r.is_default ? 'Default' : ''),
            // §4.38 — a badge only where there is something to say.
            render: (r) =>
              r.is_default ? (
                <StatusBadge status="Default" tone="emerald" />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            key: 'updated_at',
            header: 'Updated',
            sortable: true,
            // §4.19 — a column whose key names a date needs a render.
            render: (r) => formatDate(r.updated_at),
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: (q) => {
            setSearch(q);
            setPage(1);
          },
        }}
      />

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({
              status: 'success',
              title: 'Created',
              message: 'The invoice template has been created.',
            });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({
              status: 'success',
              title: 'Saved',
              message: 'Your changes to this invoice template have been saved.',
            });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

/** One labelled row in the options column. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FormModal({
  row,
  onClose,
  onSaved,
}: {
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [code, setCode] = useState(row?.template_code ?? '');
  const [name, setName] = useState(row?.template_name ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [layout, setLayout] = useState<LayoutKey>(row?.layout ?? 'classic');
  const [isDefault, setIsDefault] = useState(row?.is_default ?? false);
  const [options, setOptions] = useState<TemplateOptions>(row?.options ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TemplateOptions>(key: K, value: TemplateOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  /**
   * The preview URL — the whole template in the query string.
   *
   * Recomputed on every change so the pane follows the form, and memoised so an
   * unrelated re-render does not reload the iframe and make the preview flicker.
   */
  const previewUrl = useMemo(() => {
    const sp = new URLSearchParams({ layout, options: JSON.stringify(options) });
    return `/api/v1/invoice-templates/preview?${sp}`;
  }, [layout, options]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/invoice-templates/${row!.id}` : '/api/v1/invoice-templates';
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_code: code,
          template_name: name,
          description: description.trim() || null,
          layout,
          options,
          is_default: isDefault,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json.error?.message ||
            'This template could not be saved. Check the code and name, then try again.',
        );
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card flex max-h-[92vh] w-full max-w-5xl flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Invoice Template' : 'New Invoice Template'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
            {/* ── settings ─────────────────────────────────────────── */}
            <div className="space-y-3">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Field label="Code" hint="Stored on each invoice.">
                  <input
                    className="input font-mono uppercase"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={5}
                    placeholder="MODB"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Template Name">
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={100}
                      placeholder="Modern Blue"
                    />
                  </Field>
                </div>
              </div>

              <Field label="Description">
                <input
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={255}
                />
              </Field>

              <Field
                label="Layout"
                hint={LAYOUTS.find((l) => l.key === layout)?.description}
              >
                {/* §4.16 — pick-one is a SearchableSelect, never a raw select. */}
                <SearchableSelect
                  value={layout}
                  onChange={(v) => setLayout(v as LayoutKey)}
                  options={LAYOUTS.map((l) => ({ value: l.key, label: l.name }))}
                  aria-label="Layout"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Title" hint="The big word at the top.">
                  <input
                    className="input"
                    value={options.title ?? ''}
                    onChange={(e) => set('title', e.target.value || undefined)}
                    maxLength={40}
                    placeholder="FACTURE"
                  />
                </Field>
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 shrink-0 cursor-pointer rounded border border-input bg-card"
                      value={options.accentColor ?? '#111111'}
                      onChange={(e) => set('accentColor', e.target.value)}
                      aria-label="Accent colour"
                    />
                    {/* §4.36 — min-w-0 so a long value cannot widen the row. */}
                    <input
                      className="input min-w-0 flex-1 font-mono"
                      value={options.accentColor ?? ''}
                      onChange={(e) => set('accentColor', e.target.value || undefined)}
                      placeholder="#111111"
                      maxLength={7}
                    />
                  </div>
                </Field>
              </div>

              <Field label="Tagline" hint="Under the company name.">
                <input
                  className="input"
                  value={options.tagline ?? ''}
                  onChange={(e) => set('tagline', e.target.value || undefined)}
                  maxLength={80}
                  placeholder="Customs Clearance & Logistics"
                />
              </Field>

              <Field label="Letterhead address">
                <textarea
                  className="input h-16"
                  value={options.companyAddress ?? ''}
                  onChange={(e) => set('companyAddress', e.target.value || undefined)}
                  maxLength={300}
                />
              </Field>

              <Field label="Terms & conditions">
                <textarea
                  className="input h-16"
                  value={options.termsText ?? ''}
                  onChange={(e) => set('termsText', e.target.value || undefined)}
                  maxLength={600}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Footer line">
                  <input
                    className="input"
                    value={options.footerText ?? ''}
                    onChange={(e) => set('footerText', e.target.value || undefined)}
                    maxLength={200}
                  />
                </Field>
                <Field label="Page size">
                  <SearchableSelect
                    value={options.pageSize ?? 'A4'}
                    onChange={(v) => set('pageSize', v as 'A4' | 'Letter')}
                    options={[
                      { value: 'A4', label: 'A4' },
                      { value: 'Letter', label: 'Letter' },
                    ]}
                    aria-label="Page size"
                  />
                </Field>
              </div>

              <Field label="Contact strip" hint="The coloured band at the foot of the Modern layout.">
                <input
                  className="input"
                  value={options.contactLine ?? ''}
                  onChange={(e) => set('contactLine', e.target.value || undefined)}
                  maxLength={200}
                />
              </Field>

              {/* §4.11 — every on/off setting is a Toggle. */}
              <div className="space-y-2 rounded-md border border-border p-3">
                {(
                  [
                    ['showCategoryHeaders', 'Category headings'],
                    ['showCifPanel', 'Weight & CIF panel'],
                    ['showPaymentInfo', 'Payment info block'],
                    ['showSignature', 'Operator signature'],
                    ['showWatermark', 'NOT VALID watermark'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle
                      size="sm"
                      checked={options[key] ?? true}
                      onChange={(v) => set(key, v)}
                      aria-label={label}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <div className="space-y-0.5">
                  <span className="label mb-0 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" /> Default template
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Used by any invoice that names no template. Only one can hold it — turning this
                    on stands the current default down.
                  </p>
                </div>
                <Toggle
                  checked={isDefault}
                  onChange={setIsDefault}
                  aria-label="Default template"
                />
              </div>
            </div>

            {/* ── live preview ─────────────────────────────────────── */}
            <div className="flex min-h-0 flex-col">
              <label className="label">Preview</label>
              <p className="mb-2 text-xs text-muted-foreground">
                Sample data, drawn by the same renderer that prints the real invoice.
              </p>
              <div className="min-h-[420px] flex-1 overflow-hidden rounded-md border border-border bg-white">
                <iframe
                  // Keyed on the URL so a change REPLACES the frame rather than
                  // navigating it — otherwise every tweak pushes a history entry
                  // and the browser Back button walks through old previews.
                  key={previewUrl}
                  src={previewUrl}
                  title="Invoice template preview"
                  className="h-full w-full"
                  // The preview is our own HTML, but it is still a document
                  // built from operator-typed values — no scripts, no forms.
                  sandbox=""
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            {/* §4.21 — a labelled way out, in every mode. */}
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
