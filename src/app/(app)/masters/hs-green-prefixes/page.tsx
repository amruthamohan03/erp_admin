'use client';

import { useCallback, useEffect, useState } from 'react';
import { Leaf, Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { formatDate } from '@/lib/formatDate';
import { normaliseHsCode } from '@/lib/hscodes/greenCertificate';

// §4.1 — the standing green-certificate rule, as data an operator maintains.
//
// One row covers every tariff line starting with those digits, including codes
// added next year. A single HS code can still override it from the HS Code
// master, which is why this screen says so rather than letting the rule look
// absolute.

interface Row {
  id: number;
  prefix: string;
  note: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function HsGreenPrefixesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/hs-green-prefixes?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
        setLoadError(null);
      } else {
        // A failed load must not render as an empty table. "No prefix rules
        // yet" and "the server did not answer" look identical on screen, and
        // the first one invites an operator to add a rule that already exists.
        setItems([]);
        setTotal(0);
        setLoadError(json.error?.message || 'The prefix rules could not be loaded.');
      }
    } catch {
      setItems([]);
      setTotal(0);
      setLoadError('The prefix rules could not be loaded. Check your connection and refresh.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (
      !confirm(
        'Disable this prefix rule? HS codes it covers will stop requiring a green certificate unless they say so individually.',
      )
    ) {
      return;
    }
    const res = await fetch(`/api/v1/hs-green-prefixes/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({
        status: 'error',
        title: 'Not deleted',
        message: json.error?.message || 'This prefix rule could not be disabled.',
      });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: 'The prefix rule has been disabled.',
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Green Certificate Codes</h1>
      </div>

      {/* The rule is easy to read as absolute, and the exception lives on a
          different screen — so this names where it is rather than leaving an
          operator to discover it by accident. */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <Leaf className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Any HS code starting with one of these numbers requires an environmental clearance
          certificate — including codes added later. Dots and spaces are ignored, so{' '}
          <span className="font-mono">0301</span> covers{' '}
          <span className="font-mono">0301.11.00</span>. A single code can still be forced on or off
          individually on the HS Codes screen.
        </p>
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
        searchPlaceholder="Search prefix, note..."
        emptyMessage="No prefix rules yet — add the first range of codes that needs a green certificate."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Prefix
          </button>
        }
        columns={[
          { key: 'prefix', header: 'Starts with', sortable: true, className: 'font-mono' },
          {
            key: 'note',
            header: 'Covers',
            render: (r) => r.note || <span className="text-muted-foreground">—</span>,
          },
          {
            key: 'created_at',
            header: 'Added',
            sortable: true,
            // §4.19 — a column whose key names a date needs a render.
            render: (r) => formatDate(r.created_at),
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
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
              message:
                'The prefix rule has been added. HS codes starting with it now require a green certificate.',
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
              message: 'Your changes to this prefix rule have been saved.',
            });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
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
  const [prefix, setPrefix] = useState(row?.prefix || '');
  const [note, setNote] = useState(row?.note || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // What the rule will actually compare on. A prefix is stored as typed and
  // matched on digits, so showing the digits back is the difference between an
  // operator trusting the rule and guessing at it.
  const digits = normaliseHsCode(prefix);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/hs-green-prefixes/${row!.id}` : '/api/v1/hs-green-prefixes';

    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json.error?.message ||
            'This prefix rule could not be saved. Check the digits and try again.',
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{isEdit ? 'Edit Prefix Rule' : 'New Prefix Rule'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="label required">HS codes starting with</label>
            <input
              className="input font-mono"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="0301"
              required
              maxLength={20}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {digits
                ? `Matches every HS code beginning ${digits}, however it is punctuated.`
                : 'Digits only — dots and spaces are ignored when matching.'}
            </p>
          </div>

          <div>
            <label className="label">Covers</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Live fish and fish products"
              maxLength={255}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              What this range is, so the rule is reviewable a year from now.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
