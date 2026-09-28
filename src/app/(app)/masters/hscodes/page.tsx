'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Leaf, Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import {
  greenCertificateFor,
  matchingPrefix,
  type GreenCertificateVerdict,
} from '@/lib/hscodes/greenCertificate';

interface Row {
  id: number;
  hscode_number: string;
  hscode_ddi: string | null;
  hscode_ica: string | null;
  hscode_dci: string | null;
  hscode_dcl: string | null;
  hscode_tpi: string | null;
  /**
   * The per-code OVERRIDE only (0124) — `null` means "follow the prefix rules".
   * Never render this column on its own; `green_certificate` below is the
   * answer, and the server resolves it against the prefix master.
   */
  requires_green_certificate: boolean | null;
  green_certificate: GreenCertificateVerdict;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

/**
 * The three states of the per-code override, as an operator reads them.
 *
 * A `<Toggle>` cannot carry this: the middle state is the important one and a
 * switch has only two (§4.11's own note on indeterminate). It is a pick-one
 * list, so it is a `<SearchableSelect>` (§4.16).
 */
const OVERRIDE_OPTIONS = [
  { value: 'auto', label: 'Follow the prefix rules' },
  { value: 'yes', label: 'Always required' },
  { value: 'no', label: 'Exempt — never required' },
];

function overrideToValue(v: boolean | null | undefined): string {
  return v === true ? 'yes' : v === false ? 'no' : 'auto';
}

function valueToOverride(v: string): boolean | null {
  return v === 'yes' ? true : v === 'no' ? false : null;
}

const RATE_FIELDS = [
  { key: 'hscode_ddi', label: 'DDI' },
  { key: 'hscode_ica', label: 'ICA' },
  { key: 'hscode_dci', label: 'DCI' },
  { key: 'hscode_dcl', label: 'DCL' },
  { key: 'hscode_tpi', label: 'TPI' },
] as const;
type RateKey = (typeof RATE_FIELDS)[number]['key'];

function fmt(n: string | null): string {
  if (n === null || n === undefined) return '0.00';
  return n;
}

export default function HscodesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);
  // The standing prefix rules, so the form can say what "follow the rules"
  // actually means for the number being typed — the same resolver the server
  // uses, rather than a second description of the rule (§4.10).
  const [prefixes, setPrefixes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/hs-green-prefixes?pageSize=100')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok) {
          setPrefixes((j.data as { prefix: string }[]).map((p) => p.prefix));
        }
      })
      // A failed load costs the preview, not the form — the server still
      // decides, so saving remains correct either way.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/hscodes?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this HS code?')) return;
    const res = await fetch(`/api/v1/hscodes/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This HS code could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The HS code has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">HS Codes</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/hscodes/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search HS code..."
        emptyMessage="No HS codes yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New HS Code
          </button>
        }
        columns={[
          { key: 'hscode_number', header: 'HS Code', sortable: true, className: 'font-mono' },
          ...RATE_FIELDS.map((f) => ({
            key: f.key,
            header: `${f.label} (%)`,
            align: 'right' as const,
            className: 'font-mono text-xs',
            render: (r: Row) => fmt(r[f.key as RateKey]),
          })),
          {
            key: 'green_certificate',
            header: 'Green Cert.',
            align: 'center' as const,
            sortable: true,
            // Sorted and searched on the EFFECTIVE answer, not on the stored
            // override — the column shows one and §4.25.1 says an operator must
            // be able to type what they see.
            value: (r: Row) =>
              r.green_certificate.required
                ? 'Required'
                : r.green_certificate.source === 'override'
                  ? 'Exempt'
                  : '',
            // A badge only where there is something to say. Printing "No" on
            // every other row makes the column a wall of noise, and what an
            // operator scans for is the exception (§4.25's "scanned, not read").
            render: (r: Row) => {
              const g = r.green_certificate;
              if (g.required) {
                return (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                    // Which rule decided it. Without this the operator cannot
                    // tell a standing rule from a decision made on this row,
                    // and so cannot tell where to go to change it.
                    title={
                      g.source === 'prefix'
                        ? `Required by the rule for codes starting ${g.prefix}`
                        : 'Required — set on this code itself'
                    }
                  >
                    <Leaf className="h-3 w-3" />
                    {g.source === 'prefix' ? g.prefix : 'Required'}
                  </span>
                );
              }
              if (g.source === 'override') {
                // An exemption is a decision somebody made, so it is visible.
                // Rendering it as "—" would hide it behind the same blank as
                // every code nobody has ever considered.
                return (
                  <span
                    className="text-[11px] font-medium text-muted-foreground"
                    title="Exempt — set on this code, overriding any prefix rule"
                  >
                    Exempt
                  </span>
                );
              }
              return <span className="text-muted-foreground">—</span>;
            },
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {showCreate && (
        <FormModal
          prefixes={prefixes}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The HS code has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          prefixes={prefixes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this HS code have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  prefixes,
  onClose,
  onSaved,
}: {
  row?: Row;
  prefixes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [number, setNumber] = useState(row?.hscode_number || '');
  const [rates, setRates] = useState<Record<RateKey, string>>({
    hscode_ddi: row?.hscode_ddi ?? '0.00',
    hscode_ica: row?.hscode_ica ?? '0.00',
    hscode_dci: row?.hscode_dci ?? '0.00',
    hscode_dcl: row?.hscode_dcl ?? '0.00',
    hscode_tpi: row?.hscode_tpi ?? '0.00',
  });
  const [greenCert, setGreenCert] = useState(
    overrideToValue(row?.requires_green_certificate),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The live answer for what is currently typed, from the same function the
  // server calls (§4.10) — so "Follow the prefix rules" is never an opaque
  // choice, and a rule that already covers this code is visible before saving.
  const verdict = greenCertificateFor(number, valueToOverride(greenCert), prefixes);
  // Which rule covers this code regardless of the override — the reason an
  // "Exempt" choice is meaningful, and what it is exempting from.
  const coveringPrefix = matchingPrefix(number, prefixes);

  const checkValue = isEdit && number === row?.hscode_number ? '' : number;
  const { status, message } = useUniqueCheck({
    resource: 'hscodes',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      // §4.23 — name the field and the value. "Already exists" left the operator
      // to work out which of the six inputs it meant.
      setError(`HS Code Number “${number.trim()}” is already in use. Enter a different number.`);
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/hscodes/${row!.id}` : '/api/v1/hscodes';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hscode_number: number,
          ...rates,
          requires_green_certificate: valueToOverride(greenCert),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // The server's sentence first — it names the field and the fix. The
        // fallback used to be "Save failed", which §4.23 lists as a defect by
        // name: it tells the operator something broke and nothing else.
        setError(
          json.error?.message ||
            'This HS code could not be saved. Check the number and the rate percentages, then try again.',
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit HS Code' : 'Create HS Code'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
              {error}
            </div>
          )}
          <div>
            <label className="label required">HS Code Number</label>
            <input
              className="input font-mono"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
              maxLength={100}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {RATE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label} (%)</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
                  min="0"
                  max="999.99"
                  value={rates[f.key]}
                  onChange={(e) =>
                    setRates((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          {/* Tri-state, because the standing rule lives in the prefix master
              (0124) and this is the per-code exception. A Toggle would collapse
              "nobody has said" into "exempt". */}
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <span className="label mb-0 block">Green Certificate</span>
              <p className="text-xs text-muted-foreground">
                Goods under this code cannot be declared without an environmental clearance
                certificate.
              </p>
            </div>

            <SearchableSelect
              value={greenCert}
              onChange={setGreenCert}
              options={OVERRIDE_OPTIONS}
              aria-label="Green certificate requirement"
            />

            {/* What the choice means for THIS number, now. The rule is invisible
                from here otherwise — an operator would have to open another
                screen to find out whether a prefix already covers the code. */}
            <p className="text-xs text-muted-foreground">
              {verdict.required ? (
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  A green certificate will be required.
                </span>
              ) : (
                <span>No green certificate will be required.</span>
              )}{' '}
              {greenCert === 'auto' &&
                (coveringPrefix
                  ? `Covered by the rule for codes starting ${coveringPrefix}.`
                  : 'No prefix rule covers this code.')}
              {greenCert === 'no' &&
                (coveringPrefix
                  ? `This exempts it from the rule for codes starting ${coveringPrefix}.`
                  : 'No prefix rule covers this code, so this changes nothing today — it will hold if one is added later.')}
              {greenCert === 'yes' && 'Set on this code, whatever the prefix rules say.'}
            </p>

            <p className="text-xs text-muted-foreground">
              <Link href="/masters/hs-green-prefixes" className="text-primary-600 hover:underline">
                Manage prefix rules
              </Link>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || status === 'taken'}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
