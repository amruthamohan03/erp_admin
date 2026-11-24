'use client';

// Import Apurement → files awaiting apurement, for one client.
//
// Every row is a quitted import file that no transmission has carried yet. The
// operator records three things per file — ASS REF, Type, Remarque — directly
// in the grid, then saves every edited row with the one Save (§4.17): all or
// nothing, so a partly-saved batch cannot exist.
//
//   ASS REF   — offered from the file's Insurance Reference (dashed) until a
//               value is saved; "Auto ASS REF" saves that for every file at once.
//   Type      — from Masters → Apurement Options. A Type whose "Requires
//               Remarque" is off clears and disables the Remarque.
//   Remarque  — required when the Type says so; the save is refused otherwise.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, Wand2 } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BackButton from '@/components/ui/BackButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchClientOptions } from '@/lib/clientOptions';
import { formatDate } from '@/lib/formatDate';
import { cn } from '@/lib/utils';
import type { ApurementFileRow } from '@/db/queries/importApurement';
import { formatMoney } from '@/lib/exchangeRates';

const API = '/api/v1/import-apurement';

interface OptionRow {
  id: number;
  option_group: 'type' | 'remark';
  option_name: string;
  requires_remark: boolean;
  display: 'Y' | 'N';
}

/** What the operator changed on one row, field by field. Absent = untouched. */
interface RowEdit {
  ass_ref?: string;
  clearance_type_id?: number | null;
  clearance_remark_id?: number | null;
}

export default function PendingApurementPage() {
  return (
    <Suspense fallback={<div className="card p-6 text-muted-foreground">Loading…</div>}>
      <PendingGrid />
    </Suspense>
  );
}

function PendingGrid() {
  const params = useSearchParams();
  const clientId = params.get('client_id') ?? '';

  const [rows, setRows] = useState<ApurementFileRow[]>([]);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [clientLabel, setClientLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await safeFetchJson<ApurementFileRow[]>(`${API}/pending?client_id=${clientId}`);
      if (res.ok) setRows(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Disabled options included, so a file saved with one still names it.
    safeFetchJson<OptionRow[]>('/api/v1/apurement-options?include_disabled=true&pageSize=100').then((res) => {
      if (res.ok) setOptions(res.data);
    });
    fetchClientOptions().then((list) => setClientLabel(list.find((c) => c.value === clientId)?.label ?? ''));
  }, [clientId]);

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const dirty = Object.keys(edits).length;

  // ---- What a row currently shows: the edit if there is one, else what is stored.
  const typeIdOf = useCallback(
    (r: ApurementFileRow): number | null => {
      const e = edits[r.import_id];
      return e && e.clearance_type_id !== undefined ? e.clearance_type_id : r.clearance_type_id;
    },
    [edits],
  );
  const remarkIdOf = useCallback(
    (r: ApurementFileRow): number | null => {
      const e = edits[r.import_id];
      return e && e.clearance_remark_id !== undefined ? e.clearance_remark_id : r.clearance_remark_id;
    },
    [edits],
  );
  const assRefOf = (r: ApurementFileRow): string => edits[r.import_id]?.ass_ref ?? r.saved_ass_ref ?? r.auto_ass_ref ?? '';
  const isAutoAssRef = (r: ApurementFileRow): boolean =>
    edits[r.import_id]?.ass_ref === undefined && !r.saved_ass_ref?.trim() && !!r.auto_ass_ref;
  const requiresRemark = (r: ApurementFileRow): boolean => {
    const t = typeIdOf(r);
    return t != null && !!optionById.get(t)?.requires_remark;
  };

  function edit(importId: number, patch: RowEdit) {
    setEdits((all) => {
      const next = { ...(all[importId] ?? {}), ...patch };
      // A Type that does not need a Remarque clears it — what the server would do.
      if (patch.clearance_type_id !== undefined) {
        const type = patch.clearance_type_id != null ? optionById.get(patch.clearance_type_id) : undefined;
        if (type && !type.requires_remark) next.clearance_remark_id = null;
      }
      return { ...all, [importId]: next };
    });
    setInvalid((s) => {
      if (!s.has(importId)) return s;
      const n = new Set(s);
      n.delete(importId);
      return n;
    });
  }

  /** The active options of a group, plus the row's own value if it has since been disabled. */
  function choicesFor(group: 'type' | 'remark', current: number | null) {
    return options
      .filter((o) => o.option_group === group && (o.display === 'Y' || o.id === current))
      .map((o) => ({ value: String(o.id), label: o.display === 'Y' ? o.option_name : `${o.option_name} (disabled)` }));
  }

  const save = useCallback(async () => {
    const ids = Object.keys(edits).map(Number);
    if (ids.length === 0) return;

    // §4.23 — the same rule the server applies, checked before the round trip.
    const byId = new Map(rows.map((r) => [r.import_id, r]));
    const missing = ids.filter((id) => {
      const r = byId.get(id);
      if (!r) return false;
      const e = edits[id]!;
      const typeId = e.clearance_type_id !== undefined ? e.clearance_type_id : r.clearance_type_id;
      const remarkId = e.clearance_remark_id !== undefined ? e.clearance_remark_id : r.clearance_remark_id;
      return typeId != null && !!optionById.get(typeId)?.requires_remark && remarkId == null;
    });
    if (missing.length > 0) {
      setInvalid(new Set(missing));
      const names = missing.map((id) => byId.get(id)?.mca_ref ?? `#${id}`);
      setResult({
        status: 'error',
        title: 'Not saved',
        message: `${missing.length === 1 ? 'This file needs' : `${missing.length} files need`} a Remarque for the Type chosen: ${names.slice(0, 10).join(', ')}${names.length > 10 ? ` and ${names.length - 10} more` : ''}.`,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await safeFetchJson<{ saved: number }>(`${API}/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: ids.map((id) => ({ import_id: id, ...edits[id] })) }),
      });
      if (!res.ok) {
        // §4.22 — failure dismisses in place; the edits stay on screen.
        setResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
        return;
      }
      setEdits({});
      setResult({
        status: 'success',
        title: 'Saved',
        message: `${res.data.saved} file${res.data.saved === 1 ? ' has' : 's have'} been saved for ${clientLabel || 'this client'}.`,
      });
      load();
    } finally {
      setSaving(false);
    }
  }, [edits, rows, optionById, clientLabel, load]);

  // Ctrl/⌘+S saves; leaving with unsaved edits asks first.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty > 0 && !saving) save();
      }
    }
    function onLeave(e: BeforeUnloadEvent) {
      if (dirty > 0) e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [dirty, saving, save]);

  async function runAutoAssRef() {
    setConfirmAuto(false);
    const res = await safeFetchJson<{ filled: number }>(`${API}/pending/auto-ass-ref`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: Number(clientId) }),
    });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
      return;
    }
    setResult({
      status: 'success',
      title: 'Saved',
      message: res.data.filled
        ? `ASS REF was filled from the Insurance Reference on ${res.data.filled} file${res.data.filled === 1 ? '' : 's'}.`
        : 'Every file with an Insurance Reference already has an ASS REF — nothing was changed.',
    });
    load();
  }

  if (!clientId) {
    return (
      <div className="card p-6 text-sm text-muted-foreground">
        No client was chosen. Open the pending files from Import Apurement by clicking the “Files awaiting apurement” card.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <BackButton fallback="/import-apurement" />
        <h1 className="text-2xl font-bold text-foreground">
          Files awaiting apurement{clientLabel ? ` — ${clientLabel}` : ''}
        </h1>
      </div>

      <DataTable<ApurementFileRow>
        tableId="apurement-pending"
        rows={rows}
        loading={loading}
        rowKey={(r) => r.import_id}
        searchPlaceholder="Search licence, file ref, declaration, quittance, ASS REF, AV..."
        emptyMessage="This client has no file awaiting apurement — files appear here once they have a quittance date."
        exportHref={`${API}/pending/export?client_id=${clientId}`}
        toolbar={
          <button
            type="button"
            onClick={() => {
              if (dirty > 0) {
                setResult({ status: 'error', title: 'Not started', message: 'Save your edits first — Auto ASS REF reloads the grid, which would discard them.' });
              } else {
                setConfirmAuto(true);
              }
            }}
            className="btn-neutral btn-sm"
          >
            <Wand2 className="h-4 w-4" /> Auto ASS REF
          </button>
        }
        columns={[
          { key: 'license_number', header: 'Num Licence', sortable: true, className: 'text-xs font-medium' },
          { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono text-xs' },
          { key: 'fob', header: 'FOB', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.fob) },
          { key: 'fret', header: 'Fret', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.fret) },
          { key: 'assurance', header: 'Assurance', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.assurance) },
          { key: 'autres_frets', header: 'Autres Frets', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.autres_frets) },
          { key: 'cif', header: 'CIF', align: 'right', sortable: true, className: 'tabular-nums text-xs font-semibold', render: (r) => formatMoney(r.cif) },
          { key: 'ref_decl', header: 'Ref Decl', className: 'text-xs' },
          { key: 'date_decl', header: 'Date Decl', sortable: true, className: 'text-xs', render: (r) => formatDate(r.date_decl) },
          { key: 'ref_liquid', header: 'Ref Liquid', className: 'text-xs' },
          { key: 'date_liquid', header: 'Date Liquid', sortable: true, className: 'text-xs', render: (r) => formatDate(r.date_liquid) },
          { key: 'ref_quit', header: 'Ref Quit', className: 'text-xs' },
          { key: 'date_quit', header: 'Date Quit', sortable: true, className: 'text-xs', render: (r) => formatDate(r.date_quit) },
          { key: 'monnaie', header: 'Monnaie', className: 'text-xs' },
          { key: 'date_val', header: 'Date Val', className: 'text-xs', render: (r) => formatDate(r.date_val) },
          { key: 'date_ech', header: 'Date Ech', sortable: true, className: 'text-xs', render: (r) => formatDate(r.date_ech) },
          { key: 'cif_lic', header: 'CIF Lic', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.cif_lic) },
          { key: 'num_av', header: 'Num AV', className: 'text-xs' },
          { key: 'montant_av', header: 'Montant AV', align: 'right', className: 'tabular-nums text-xs', render: (r) => formatMoney(r.montant_av) },
          {
            key: 'ass_ref',
            header: 'ASS REF',
            value: (r) => assRefOf(r),
            render: (r) => {
              const auto = isAutoAssRef(r);
              return (
                <input
                  className={cn(
                    'input h-8 min-w-[10rem] text-xs',
                    auto && 'border-dashed border-amber-500 dark:border-amber-400',
                    edits[r.import_id]?.ass_ref !== undefined && 'border-amber-500 bg-amber-50 dark:bg-amber-500/10',
                  )}
                  value={assRefOf(r)}
                  maxLength={100}
                  onChange={(e) => edit(r.import_id, { ass_ref: e.target.value })}
                  aria-label={`ASS REF for ${r.mca_ref ?? r.import_id}`}
                  title={auto ? 'From the Insurance Reference — not saved yet. Save, or use Auto ASS REF.' : undefined}
                />
              );
            },
          },
          { key: 'facture', header: 'Facture', className: 'text-xs' },
          { key: 'bl_lta', header: 'BL/LTA', className: 'text-xs' },
          {
            key: 'clearance_type',
            header: 'Type',
            value: (r) => optionById.get(typeIdOf(r) ?? -1)?.option_name ?? '',
            render: (r) => {
              const current = typeIdOf(r);
              return (
                <SearchableSelect
                  size="sm"
                  className="min-w-[8rem]"
                  value={current == null ? '' : String(current)}
                  onChange={(v) => edit(r.import_id, { clearance_type_id: v ? Number(v) : null })}
                  options={choicesFor('type', current)}
                  emptyLabel="—"
                  placeholder="—"
                  aria-label={`Type for ${r.mca_ref ?? r.import_id}`}
                />
              );
            },
          },
          {
            key: 'clearance_remark',
            header: 'Remarque',
            value: (r) => optionById.get(remarkIdOf(r) ?? -1)?.option_name ?? '',
            render: (r) => {
              const current = remarkIdOf(r);
              const needed = requiresRemark(r);
              return (
                <SearchableSelect
                  size="sm"
                  className="min-w-[11rem]"
                  value={current == null ? '' : String(current)}
                  onChange={(v) => edit(r.import_id, { clearance_remark_id: v ? Number(v) : null })}
                  options={choicesFor('remark', current)}
                  emptyLabel="—"
                  placeholder={needed ? 'Required' : '—'}
                  disabled={typeIdOf(r) != null && !needed}
                  required={needed}
                  invalid={invalid.has(r.import_id)}
                  aria-label={`Remarque for ${r.mca_ref ?? r.import_id}`}
                />
              );
            },
          },
        ]}
      />

      <div className="sticky bottom-0 z-20 -mx-4 mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-6 sm:px-6">
        {dirty > 0 && (
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {dirty} file{dirty === 1 ? '' : 's'} edited — not saved yet
          </span>
        )}
        <button type="button" onClick={save} disabled={dirty === 0 || saving} className="btn-primary">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : `Save${dirty ? ` (${dirty})` : ''}`}
        </button>
      </div>

      <ConfirmDialog
        open={confirmAuto}
        title="Auto ASS REF"
        confirmLabel="Fill ASS REF"
        onConfirm={runAutoAssRef}
        onCancel={() => setConfirmAuto(false)}
      >
        Save each pending file&apos;s <strong>Insurance Reference</strong> as its ASS REF, for every file of{' '}
        {clientLabel || 'this client'} that has no ASS REF yet? A saved ASS REF is never overwritten.
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
